/**
 * Demo traffic: a handful of builder-operated wallets that invoice each other the way
 * a small supplier network does, then fund only their net positions.
 *
 * Each debtor posts its own IOU through Arc's Memo contract (invoice text attached
 * onchain), and each net debtor approves + deposits in one Multicall3From batch.
 *
 *   SETOFF_NETWORK=testnet FUNDER_PK=0x... DEMO_MNEMONIC="..." npm run demo:seed -- [ious]
 */
import {
  createWalletClient,
  getAbiItem,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { memoAbi } from "./memoAbi.ts";
import { setoffAbi } from "./setoffAbi.ts";
import { MEMO, MULTICALL3_FROM, network, USDC } from "./config.ts";
import { loadBalances, loadPool, publicClient } from "./chain.ts";
import { balanceKey } from "./select.ts";

const multicall3FromAbi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

// Roles only — these are demo wallets run by the builder, not real businesses.
export const DEMO_ROLES = ["Design studio", "Dev agency", "Print shop", "Courier", "Cafe", "Freelance writer"];
const WORK = {
  "Design studio": ["brand refresh", "pitch deck design", "packaging mockups"],
  "Dev agency": ["landing page build", "API integration", "bug-fix retainer"],
  "Print shop": ["flyer print run", "business cards", "event banners"],
  Courier: ["same-day deliveries", "parcel pickups", "weekly route"],
  Cafe: ["team catering", "client meeting coffee", "launch party snacks"],
  "Freelance writer": ["blog posts", "product copy", "newsletter issue"],
} as Record<string, string[]>;

const net = network();
const client = publicClient(net);
const funder = privateKeyToAccount(process.env.FUNDER_PK as Hex);
const mnemonic = process.env.DEMO_MNEMONIC;
if (!mnemonic) throw new Error("DEMO_MNEMONIC is required");
const count = Number(process.argv[2] ?? 6);

// Mainnet runs on a few dollars: invoices are cents, so keep gas top-ups small too.
const GAS_FLOOR = parseUnits(process.env.SEED_GAS_FLOOR ?? "0.05", 18);
const MAX_INVOICE_CENTS = Number(process.env.SEED_MAX_CENTS ?? 150);

const people = DEMO_ROLES.map((role, i) => ({ role, account: mnemonicToAccount(mnemonic, { addressIndex: i }) }));
const wallet = (acct: (typeof people)[number]["account"] | typeof funder) =>
  createWalletClient({ account: acct, chain: net.chain, transport: http(net.rpc) });

async function send(acct: Parameters<typeof wallet>[0], tx: Parameters<ReturnType<typeof wallet>["writeContract"]>[0]) {
  const hash = await wallet(acct).writeContract(tx as never);
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`reverted: ${net.explorer}/tx/${hash}`);
  return hash;
}

// 1. Gas: native USDC on Arc *is* the ERC-20 balance, so one top-up covers gas and deposits.
for (const p of people) {
  const bal = await client.getBalance({ address: p.account.address });
  if (bal >= GAS_FLOOR) continue;
  const hash = await wallet(funder).sendTransaction({ to: p.account.address, value: GAS_FLOOR * 2n - bal, chain: net.chain });
  await client.waitForTransactionReceipt({ hash });
  console.log(`topped up ${p.role} ${p.account.address}`);
}

// 1b. Names: each demo wallet registers its role as an ERC-8004 identity (once).
const identityAbi = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "agentURI", type: "string" }], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;
{
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const registered = new Set<string>();
  for (let from = net.deployBlock; from <= head; from += 10_000n) {
    const logs = await client.getLogs({
      address: net.identityRegistry,
      event: getAbiItem({ abi: identityAbi, name: "Registered" }),
      args: { owner: people.map((p) => p.account.address) },
      fromBlock: from,
      toBlock: from + 9_999n > head ? head : from + 9_999n,
    });
    for (const l of logs) if (l.args.owner) registered.add(l.args.owner.toLowerCase());
  }
  for (const p of people) {
    if (registered.has(p.account.address.toLowerCase())) continue;
    const file = { type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name: `${p.role} (demo)`, description: "Setoff demo participant run by the builder" };
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString("base64")}`;
    await send(p.account, { address: net.identityRegistry, abi: identityAbi, functionName: "register", args: [uri] });
    console.log(`registered ERC-8004 name for ${p.role}`);
  }
}

// 2. Invoices, two ways — both through Memo so the invoice text lives onchain:
//    even i: the creditor bills the debtor, who approves with a free EIP-712 signature;
//    odd  i: the debtor records what it owes directly.
const rand = (n: number) => Math.floor(Math.random() * n);
const { timestamp } = await client.getBlock();
for (let i = 0; i < count; i++) {
  const d = rand(people.length);
  const c = (d + 1 + rand(people.length - 1)) % people.length;
  const debtor = people[d]!;
  const creditor = people[c]!;
  const job = WORK[creditor.role]![rand(3)]!;
  const amount = BigInt(10_000 * (5 + rand(MAX_INVOICE_CENTS - 4))); // 6-dec cents, >= $0.05
  const ref = keccak256(toHex(`${creditor.account.address}:${timestamp}:${i}`));
  const iou = {
    debtor: debtor.account.address,
    creditor: creditor.account.address,
    token: USDC,
    amount,
    deadline: timestamp + 7n * 86_400n,
    nonce: BigInt(timestamp) * 1000n + BigInt(i),
    ref,
  };
  const note = `${creditor.role} invoice to ${debtor.role}: ${job}, ${formatUnits(amount, 6)} USDC`;
  const viaInvoice = i % 2 === 0;
  const sig = viaInvoice
    ? await debtor.account.signTypedData({
        domain: { name: "Setoff", version: "1", chainId: net.chain.id, verifyingContract: net.setoff },
        types: {
          IOU: [
            { name: "debtor", type: "address" },
            { name: "creditor", type: "address" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint128" },
            { name: "deadline", type: "uint64" },
            { name: "nonce", type: "uint256" },
            { name: "ref", type: "bytes32" },
          ],
        },
        primaryType: "IOU",
        message: iou,
      })
    : "0x";
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [iou, sig] });
  const hash = await send(viaInvoice ? creditor.account : debtor.account, {
    address: MEMO,
    abi: memoAbi,
    functionName: "memo",
    args: [net.setoff, data, ref, toHex(note)],
  });
  console.log(`${viaInvoice ? "[signed invoice]" : "[recorded]     "} ${note}  ${net.explorer}/tx/${hash}`);
}

// 3. Funding: each net debtor deposits only its shortfall, approve + deposit in one batch.
const pool = await loadPool(client, net);
const balances = await loadBalances(client, net, pool);
const nets = new Map<string, bigint>();
for (const p of pool) {
  if (p.token.toLowerCase() !== USDC.toLowerCase()) continue;
  nets.set(p.debtor.toLowerCase(), (nets.get(p.debtor.toLowerCase()) ?? 0n) - p.amount);
  nets.set(p.creditor.toLowerCase(), (nets.get(p.creditor.toLowerCase()) ?? 0n) + p.amount);
}
const gross = pool.reduce((s, p) => s + p.amount, 0n);
let funded = 0n;
for (const p of people) {
  const netPos = nets.get(p.account.address.toLowerCase()) ?? 0n;
  const have = balances.get(balanceKey(p.account.address, USDC)) ?? 0n;
  const short = -netPos - have;
  if (short <= 0n) continue;
  funded += short;
  // ERC-20 USDC is 6 decimals; native is 18. Same balance, different units.
  const wallet6 = await client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [p.account.address] });
  const reserve = GAS_FLOOR / 10n ** 12n;
  if (wallet6 < short + reserve) {
    const topUp = (short + reserve - wallet6) * 10n ** 12n;
    const hash = await wallet(funder).sendTransaction({ to: p.account.address, value: topUp, chain: net.chain });
    await client.waitForTransactionReceipt({ hash });
  }
  const calls = [
    { target: USDC, allowFailure: false, callData: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [net.setoff, short] }) },
    {
      target: net.setoff,
      allowFailure: false,
      callData: encodeFunctionData({ abi: setoffAbi, functionName: "deposit", args: [USDC, short] }),
    },
  ];
  const hash = await send(p.account, { address: MULTICALL3_FROM, abi: multicall3FromAbi, functionName: "aggregate3", args: [calls] });
  console.log(`${p.role} deposits net ${formatUnits(short, 6)} USDC  ${net.explorer}/tx/${hash}`);
}
console.log(`pool now ${pool.length} IOUs, ${formatUnits(gross, 6)} USDC gross; new deposits ${formatUnits(funded, 6)} USDC`);

export const demoAddresses: Address[] = people.map((p) => p.account.address);
