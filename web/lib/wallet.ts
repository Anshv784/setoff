"use client";

import {
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  numberToHex,
  parseUnits,
  toHex,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { memoAbi } from "./memoAbi";
import { setoffAbi } from "./setoffAbi";
import { MEMO, net } from "./config";
import { client } from "./data";
import { iouDomain, iouTypes, type Invoice, type IOU } from "./invoice";
import { identityAbi, registrationURI } from "./identity";

export const MULTICALL3_FROM: Address = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";
const aggregate3Abi = [
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

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function hasWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

function provider() {
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask or another browser wallet.");
  return window.ethereum;
}

async function ensureChain() {
  const p = provider();
  const id = numberToHex(net.chain.id);
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: id }] });
  } catch (e) {
    // 4902: chain not added yet.
    if ((e as { code?: number }).code !== 4902) throw e;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: id,
          chainName: net.name,
          nativeCurrency: net.chain.nativeCurrency,
          rpcUrls: [net.rpc],
          blockExplorerUrls: [net.explorer],
        },
      ],
    });
  }
}

export async function connect(): Promise<Address> {
  const [account] = await provider().request({ method: "eth_requestAccounts" });
  if (!account) throw new Error("Wallet returned no account");
  await ensureChain();
  return account;
}

async function wallet(account: Address) {
  await ensureChain();
  return createWalletClient({ account, chain: net.chain, transport: custom(provider()) });
}

async function confirm(hash: Hex) {
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("Transaction reverted");
  return hash;
}

/** Approve + deposit in one transaction via Arc's Multicall3From (keeps you as msg.sender). */
export async function deposit(account: Address, token: Address, amount: string) {
  const value = parseUnits(amount, 6);
  const w = await wallet(account);
  const hash = await w.writeContract({
    address: MULTICALL3_FROM,
    abi: aggregate3Abi,
    functionName: "aggregate3",
    args: [
      [
        { target: token, allowFailure: false, callData: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [net.setoff, value] }) },
        { target: net.setoff, allowFailure: false, callData: encodeFunctionData({ abi: setoffAbi, functionName: "deposit", args: [token, value] }) },
      ],
    ],
  });
  return confirm(hash);
}

export async function withdraw(account: Address, token: Address, amount: bigint) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "withdraw", args: [token, amount] }));
}

export async function cancel(account: Address, id: Hex) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "cancel", args: [id] }));
}

/** Record an IOU you owe. Goes through Arc's Memo contract so the note is stored onchain with it. */
export async function recordIOU(
  account: Address,
  input: { creditor: Address; token: Address; amount: string; days: number; note: string },
) {
  const { timestamp } = await client.getBlock();
  const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  const ref = keccak256(toHex(`${account}:${input.creditor}:${nonce}`));
  const iou = {
    debtor: account,
    creditor: input.creditor,
    token: input.token,
    amount: parseUnits(input.amount, 6),
    deadline: timestamp + BigInt(input.days) * 86_400n,
    nonce,
    ref,
  };
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [iou, "0x"] });
  const w = await wallet(account);
  return confirm(
    await w.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo", args: [net.setoff, data, ref, toHex(input.note)] }),
  );
}

export async function balances(account: Address, tokens: Address[]) {
  const [deposits, held] = await Promise.all([
    Promise.all(tokens.map((t) => client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "balanceOf", args: [account, t] }))),
    Promise.all(tokens.map((t) => client.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [account] }))),
  ]);
  return tokens.map((token, i) => ({ token, deposit: deposits[i]!, wallet: held[i]! }));
}

/** Debtor approves an invoice: an EIP-712 signature, free and gasless. */
export async function signInvoice(account: Address, iou: IOU): Promise<Hex> {
  const w = await wallet(account);
  return w.signTypedData({ account, domain: iouDomain(), types: iouTypes, primaryType: "IOU", message: iou });
}

/**
 * Post a debtor-signed IOU to the pool. Anyone can do it — usually the creditor — and it
 * goes through Memo so the invoice note is stored onchain with it.
 */
export async function postInvoice(account: Address, inv: Invoice) {
  if (!inv.sig) throw new Error("Invoice is not approved yet");
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [inv.iou, inv.sig] });
  const args = [net.setoff, data, inv.iou.ref, toHex(inv.note)] as const;
  await client.simulateContract({ account, address: MEMO, abi: memoAbi, functionName: "memo", args });
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo", args }));
}

export async function iouStatus(iou: IOU) {
  const id = await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "hashIOU", args: [iou] });
  const [, status, cycle] = await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "getIOU", args: [id] });
  return { id, status: (["none", "pending", "settled", "cancelled"] as const)[status] ?? "none", cycle };
}

/** Register an ERC-8004 identity so the dashboard shows a name instead of an address. */
export async function registerName(account: Address, name: string) {
  const w = await wallet(account);
  return confirm(
    await w.writeContract({ address: net.identityRegistry, abi: identityAbi, functionName: "register", args: [registrationURI(name)] }),
  );
}
