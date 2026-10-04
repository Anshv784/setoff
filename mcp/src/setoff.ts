/**
 * Everything the MCP tools need, as plain functions: read positions and bills, build and
 * approve invoice links, record IOUs, move deposits. Reuses the solver's network config,
 * chain readers and cycle selection so there is one source of truth.
 */
import {
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAbiItem,
  hexToString,
  http,
  hashTypedData,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MEMO, MULTICALL3_FROM, network, USDC } from "../../solver/src/config.ts";
import { loadBalances, loadCreditLines, loadFxPrefs, loadPool, publicClient } from "../../solver/src/chain.ts";
import { referenceRate, selectWithFx } from "../../solver/src/fx.ts";
import { setoffAbi } from "../../solver/src/setoffAbi.ts";
import { memoAbi } from "../../solver/src/memoAbi.ts";

export const net = network();
export const client = publicClient(net);

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

export type Token = "USDC" | "EURC";
export const tokenAddress = (t: Token): Address => (t === "USDC" ? USDC : net.eurc);
export const tokenSymbol = (a: string): Token => (a.toLowerCase() === USDC.toLowerCase() ? "USDC" : "EURC");
const fmt = (v: bigint) => formatUnits(v, 6);

// ------------------------------------------------------------------ agent wallet

export type Agent = { address: Address; maxAmount: bigint; sign: ReturnType<typeof privateKeyToAccount> };

/** The agent's own wallet and spending cap, from the environment. */
export function agentFromEnv(env = process.env): Agent | undefined {
  const pk = env.SETOFF_AGENT_PK as Hex | undefined;
  if (!pk) return undefined;
  const account = privateKeyToAccount(pk);
  return { address: account.address, maxAmount: parseUnits(env.SETOFF_MAX_AMOUNT ?? "10", 6), sign: account };
}

export function checkCap(agent: Agent, amount: bigint) {
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  if (amount > agent.maxAmount) {
    throw new Error(`Refused: ${fmt(amount)} is above this agent's limit of ${fmt(agent.maxAmount)} per action (SETOFF_MAX_AMOUNT).`);
  }
}

async function send(agent: Agent, tx: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) {
  const w = createWalletClient({ account: agent.sign, chain: net.chain, transport: http(net.rpc) });
  await client.simulateContract({ account: agent.sign, ...tx } as never);
  const hash = await w.writeContract(tx as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return { hash, explorer: net.explorer && !net.rpc.includes("127.0.0.1") ? `${net.explorer}/tx/${hash}` : undefined };
}

// ------------------------------------------------------------------------ reads

export type Bill = {
  id: Hex;
  debtor: Address;
  creditor: Address;
  token: Token;
  amount: string;
  /** Paid so far; less than amount while open = partly paid. */
  paid: string;
  status: "pending" | "settled" | "cancelled" | "expired" | "disputed";
  cycle?: string;
  note?: string;
};

/** Every bill from contract events, newest first, with invoice notes from Memo. */
export async function listBills(): Promise<Bill[]> {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const { timestamp } = await client.getBlock();
  const events = setoffAbi.filter((x) => x.type === "event" && ["IOUSubmitted", "IOUSettled", "IOUCancelled", "IOUDisputed", "IOUResolved"].includes(x.name));
  const memoEvent = getAbiItem({ abi: memoAbi, name: "Memo" });
  const rows = new Map<Hex, Bill & { deadline: bigint; ref: Hex; paidRaw: bigint; amountRaw: bigint }>();
  const notes = new Map<string, string>();
  for (let from = net.deployBlock; from <= head; from += 10_000n) {
    const to = from + 9_999n > head ? head : from + 9_999n;
    const [logs, memos] = await Promise.all([
      client.getLogs({ address: net.setoff, events, fromBlock: from, toBlock: to, strict: true }),
      client.getLogs({ address: MEMO, event: memoEvent, args: { target: net.setoff }, fromBlock: from, toBlock: to }),
    ]);
    for (const m of memos) {
      try {
        if (m.args.memoId && m.args.memo) notes.set(m.args.memoId, hexToString(m.args.memo));
      } catch {
        // binary memo (e.g. a note key)
      }
    }
    for (const log of logs as unknown as { eventName: string; args: Record<string, unknown> }[]) {
      const a = log.args;
      if (log.eventName === "IOUSubmitted") {
        rows.set(a.id as Hex, {
          id: a.id as Hex,
          debtor: a.debtor as Address,
          creditor: a.creditor as Address,
          token: tokenSymbol(a.token as string),
          amount: fmt(a.amount as bigint),
          amountRaw: a.amount as bigint,
          paid: "0",
          paidRaw: 0n,
          status: "pending",
          deadline: a.deadline as bigint,
          ref: a.ref as Hex,
        });
      } else if (log.eventName === "IOUSettled") {
        const r = rows.get(a.id as Hex);
        if (r) {
          r.paidRaw += a.amount as bigint;
          r.paid = fmt(r.paidRaw);
          r.cycle = String(a.cycle);
          if ((a.remaining as bigint) === 0n) r.status = "settled";
        }
      } else if (log.eventName === "IOUCancelled") {
        const r = rows.get(a.id as Hex);
        if (r) r.status = "cancelled";
      } else if (log.eventName === "IOUDisputed") {
        const r = rows.get(a.id as Hex);
        if (r) r.status = "disputed";
      } else if (log.eventName === "IOUResolved") {
        const r = rows.get(a.id as Hex);
        if (r) {
          const remaining = a.remaining as bigint;
          r.amountRaw = r.paidRaw + remaining;
          r.amount = fmt(r.amountRaw);
          r.status = remaining > 0n ? "pending" : r.paidRaw > 0n ? "settled" : "cancelled";
        }
      }
    }
  }
  for (const r of rows.values()) if (r.status === "pending" && r.deadline < timestamp) r.status = "expired";
  return [...rows.values()].reverse().map(({ deadline: _d, ref, paidRaw: _p, amountRaw: _a, ...b }) => {
    const note = notes.get(ref);
    return { ...b, note: note?.startsWith("setoff-enc:v1:") ? "[private note]" : note };
  });
}

/** What an address owes and is owed in open bills, its net, and its deposits. */
export async function getPosition(address: Address) {
  const me = address.toLowerCase();
  const bills = (await listBills()).filter((b) => b.status === "pending");
  const tokens = (await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "tokens" })) as Address[];
  const out: Record<string, { owe: string; owed: string; net: string; deposited: string; toDeposit: string }> = {};
  for (const t of tokens) {
    const sym = tokenSymbol(t);
    const sum = (f: (b: Bill) => boolean) =>
      bills.filter((b) => b.token === sym && f(b)).reduce((s, b) => s + parseUnits(b.amount, 6) - parseUnits(b.paid, 6), 0n);
    const owe = sum((b) => b.debtor.toLowerCase() === me);
    const owed = sum((b) => b.creditor.toLowerCase() === me);
    const deposited = await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "balanceOf", args: [address, t] });
    const netPos = owed - owe;
    const short = netPos < 0n && -netPos > deposited ? -netPos - deposited : 0n;
    out[sym] = { owe: fmt(owe), owed: fmt(owed), net: fmt(netPos), deposited: fmt(deposited), toDeposit: fmt(short) };
  }
  return { address, positions: out };
}

/** What would settle if a cycle ran now, using the same selection as the solver. */
export async function previewNextCycle() {
  const pool = await loadPool(client, net);
  if (pool.length === 0) return { openBills: 0, message: "No open bills." };
  const lines = await loadCreditLines(client, net);
  const balances = await loadBalances(client, net, pool, lines.map((l) => l.lender));
  const [{ timestamp }, prefs, rate] = await Promise.all([client.getBlock(), loadFxPrefs(client, net), referenceRate()]);
  const cycle = selectWithFx(pool, balances, timestamp, lines, prefs, tokenAddress("USDC"), tokenAddress("EURC"), rate);
  if (!cycle) return { openBills: pool.length, settleable: 0, message: "No fundable cycle yet: some net debtors haven't deposited enough." };
  return {
    openBills: pool.length,
    settleable: cycle.ids.length,
    paidInPart: cycle.partial,
    creditDraws: cycle.draws.length,
    currencySwaps: cycle.fx.map((c) => ({ account: c.account, sells: `${fmt(c.sellAmount)} ${tokenSymbol(c.sell)}`, gets: `${fmt(c.buyAmount)} ${tokenSymbol(c.buy)}` })),
    referenceRate: rate ? `${formatUnits(rate, 6)} USDC per EURC` : "unavailable",
    perToken: [...cycle.gross.entries()].map(([t, g]) => ({
      token: tokenSymbol(t),
      cleared: fmt(g),
      moved: fmt(cycle.netFunded.get(t) ?? 0n),
    })),
  };
}

// --------------------------------------------------------------------- invoices

type IOU = { debtor: Address; creditor: Address; token: Address; amount: bigint; deadline: bigint; nonce: bigint; ref: Hex };

const iouTypes = {
  IOU: [
    { name: "debtor", type: "address" },
    { name: "creditor", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint128" },
    { name: "deadline", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "ref", type: "bytes32" },
  ],
} as const;
const domain = () => ({ name: "Setoff", version: "1", chainId: net.chain.id, verifyingContract: net.setoff });

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** Same link format as the web app's invoice links, so either side can open them. */
export function encodeInvoice(iou: IOU, note: string, sig?: Hex) {
  return b64url(
    JSON.stringify({
      d: iou.debtor,
      c: iou.creditor,
      t: iou.token,
      a: iou.amount.toString(),
      e: iou.deadline.toString(),
      n: iou.nonce.toString(),
      r: iou.ref,
      m: note,
      s: sig,
      x: net.setoff,
    }),
  );
}

export function decodeInvoice(linkOrParam: string): { iou: IOU; note: string; sig?: Hex } {
  const param = linkOrParam.includes("invoice=") ? new URL(linkOrParam).searchParams.get("invoice")! : linkOrParam;
  const o = JSON.parse(unb64url(param));
  if (String(o.x).toLowerCase() !== net.setoff.toLowerCase()) throw new Error("This invoice is for a different Setoff deployment.");
  return {
    iou: { debtor: o.d, creditor: o.c, token: o.t, amount: BigInt(o.a), deadline: BigInt(o.e), nonce: BigInt(o.n), ref: o.r },
    note: String(o.m ?? ""),
    sig: o.s,
  };
}

const appUrl = (env = process.env) => (env.SETOFF_APP_URL ?? "https://setoff.anshverma.tech").replace(/\/$/, "");
export const invoiceLink = (param: string) => `${appUrl()}/app/bills?invoice=${param}`;

async function newIOU(debtor: Address, creditor: Address, token: Token, amount: bigint, days: number): Promise<IOU> {
  const { timestamp } = await client.getBlock();
  const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  return {
    debtor,
    creditor,
    token: tokenAddress(token),
    amount,
    deadline: timestamp + BigInt(days) * 86_400n,
    nonce,
    ref: keccak256(toHex(`${debtor}:${creditor}:${nonce}`)),
  };
}

/** The agent bills `debtor`. Nothing goes onchain; the debtor approves the link. */
/** Memo id the web app uses for invoices sent to a debtor's Setoff app. */
export const INVOICE_REQUEST_ID = keccak256(toHex("setoff:invoice:v1"));

export async function createInvoice(agent: Agent, input: { debtor: Address; amount: string; token: Token; note: string; days?: number; notify?: boolean }) {
  const amount = parseUnits(input.amount, 6);
  checkCap(agent, amount);
  if (input.debtor.toLowerCase() === agent.address.toLowerCase()) throw new Error("An agent can't bill itself.");
  const iou = await newIOU(input.debtor, agent.address, input.token, amount, input.days ?? 7);
  const param = encodeInvoice(iou, input.note);
  const out: Record<string, unknown> = { link: invoiceLink(param), invoice: param, debtor: input.debtor, amount: input.amount, token: input.token };
  // Post it through Memo so it shows up in the debtor's "Waiting for you" (a fraction of a cent).
  if (input.notify !== false) {
    const data = encodeFunctionData({ abi: setoffAbi, functionName: "tokens" });
    out.sentToTheirApp = await send(agent, { address: MEMO, abi: memoAbi, functionName: "memo", args: [net.setoff, data, INVOICE_REQUEST_ID, toHex(param)] });
  }
  return out;
}

/** Invoices sent to `address` through Arc that it hasn't added or that haven't expired. */
export async function listInvoiceRequests(address: Address) {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const { timestamp } = await client.getBlock();
  const memoEvent = getAbiItem({ abi: memoAbi, name: "Memo" });
  const found = new Map<Hex, { param: string; iou: IOU; note: string }>();
  for (let from = net.deployBlock; from <= head; from += 10_000n) {
    const to = from + 9_999n > head ? head : from + 9_999n;
    const memos = await client.getLogs({ address: MEMO, event: memoEvent, args: { target: net.setoff, memoId: INVOICE_REQUEST_ID }, fromBlock: from, toBlock: to });
    for (const m of memos) {
      try {
        const param = hexToString(m.args.memo!);
        const { iou, note } = decodeInvoice(param);
        // Only the creditor named in the invoice can send it.
        if (m.args.sender?.toLowerCase() !== iou.creditor.toLowerCase() || iou.debtor.toLowerCase() !== address.toLowerCase()) continue;
        if (iou.deadline <= timestamp) continue;
        found.set(hashTypedData({ domain: domain(), types: iouTypes, primaryType: "IOU", message: iou }), { param, iou, note });
      } catch {}
    }
  }
  const ids = [...found.keys()];
  const records = ids.length
    ? await client.multicall({ contracts: ids.map((id) => ({ address: net.setoff, abi: setoffAbi, functionName: "getIOU", args: [id] }) as const), allowFailure: false })
    : [];
  return ids
    .filter((_, i) => records[i]![1] === 0) // not added to Setoff yet
    .map((id) => {
      const { param, iou, note } = found.get(id)!;
      return {
        invoice: param,
        from: iou.creditor,
        amount: fmt(iou.amount),
        token: tokenSymbol(iou.token),
        note: note.startsWith("setoff-enc:v1:") ? "[private note]" : note,
        due: new Date(Number(iou.deadline) * 1000).toISOString().slice(0, 10),
      };
    })
    .reverse();
}

/** The agent approves an invoice it owes (free signature); optionally posts it itself. */
export async function approveInvoice(agent: Agent, input: { invoice: string; post?: boolean }) {
  const { iou, note } = decodeInvoice(input.invoice);
  if (iou.debtor.toLowerCase() !== agent.address.toLowerCase()) throw new Error("This invoice isn't billed to this agent.");
  checkCap(agent, iou.amount);
  const sig = await agent.sign.signTypedData({ domain: domain(), types: iouTypes, primaryType: "IOU", message: iou });
  const approved = encodeInvoice(iou, note, sig);
  const result: Record<string, unknown> = { approvedLink: invoiceLink(approved), amount: fmt(iou.amount), token: tokenSymbol(iou.token), creditor: iou.creditor };
  if (input.post) {
    const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [iou, sig] });
    result.posted = await send(agent, { address: MEMO, abi: memoAbi, functionName: "memo", args: [net.setoff, data, iou.ref, toHex(note)] });
  }
  return result;
}

/** Post an approved invoice link to the pool (anyone can; usually the creditor). */
export async function postInvoice(agent: Agent, input: { invoice: string }) {
  const { iou, note, sig } = decodeInvoice(input.invoice);
  if (!sig) throw new Error("This invoice hasn't been approved by the debtor yet.");
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [iou, sig] });
  return send(agent, { address: MEMO, abi: memoAbi, functionName: "memo", args: [net.setoff, data, iou.ref, toHex(note)] });
}

/** The agent records a bill it owes, directly (it's the sender, so no signature needed). */
export async function recordIOU(agent: Agent, input: { creditor: Address; amount: string; token: Token; note: string; days?: number }) {
  const amount = parseUnits(input.amount, 6);
  checkCap(agent, amount);
  const iou = await newIOU(agent.address, input.creditor, input.token, amount, input.days ?? 7);
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [iou, "0x"] });
  const tx = await send(agent, { address: MEMO, abi: memoAbi, functionName: "memo", args: [net.setoff, data, iou.ref, toHex(input.note)] });
  return { ...tx, creditor: input.creditor, amount: input.amount, token: input.token };
}

// ---------------------------------------------------------------------- deposits

export async function deposit(agent: Agent, input: { amount: string; token: Token }) {
  const amount = parseUnits(input.amount, 6);
  checkCap(agent, amount);
  const token = tokenAddress(input.token);
  return send(agent, {
    address: MULTICALL3_FROM,
    abi: aggregate3Abi,
    functionName: "aggregate3",
    args: [
      [
        { target: token, allowFailure: false, callData: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [net.setoff, amount] }) },
        { target: net.setoff, allowFailure: false, callData: encodeFunctionData({ abi: setoffAbi, functionName: "deposit", args: [token, amount] }) },
      ],
    ],
  });
}

export async function withdraw(agent: Agent, input: { amount: string; token: Token }) {
  const amount = parseUnits(input.amount, 6);
  // Withdrawing returns the agent's own money, so the spending cap doesn't apply.
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  return send(agent, { address: net.setoff, abi: setoffAbi, functionName: "withdraw", args: [tokenAddress(input.token), amount] });
}

// --------------------------------------------------------------- disputes & credit

/** Freeze an open bill this agent is part of, so no cycle pays it until both sides agree. */
export async function disputeBill(agent: Agent, input: { id: Hex }) {
  return send(agent, { address: net.setoff, abi: setoffAbi, functionName: "dispute", args: [input.id] });
}

/** Propose what is still owed on a disputed bill. Matching proposals reopen it; 0 cancels it. */
export async function proposeAmount(agent: Agent, input: { id: Hex; remaining: string }) {
  const remaining = parseUnits(input.remaining, 6);
  if (remaining > 0n) checkCap(agent, remaining);
  return send(agent, { address: net.setoff, abi: setoffAbi, functionName: "offer", args: [input.id, remaining] });
}

/** Let `borrower` overdraw up to `limit`, funded from this agent's deposit. 0 stops new draws. */
export async function setCreditLine(agent: Agent, input: { borrower: Address; limit: string; token: Token }) {
  const limit = parseUnits(input.limit, 6);
  if (limit > 0n) checkCap(agent, limit);
  return send(agent, { address: net.setoff, abi: setoffAbi, functionName: "setCreditLine", args: [input.borrower, tokenAddress(input.token), limit] });
}

/**
 * Opt in to converting this agent's leftover `sell` into `buy` in cycles, never below
 * `minRate` (`buy` per 1 `sell`). minRate "0" opts out.
 */
export async function setFxPreference(agent: Agent, input: { sell: Token; minRate: string }) {
  const buy: Token = input.sell === "USDC" ? "EURC" : "USDC";
  const minRate = parseUnits(input.minRate, 6);
  return send(agent, { address: net.setoff, abi: setoffAbi, functionName: "setFxPreference", args: [tokenAddress(input.sell), tokenAddress(buy), minRate] });
}

/** Repay a lender from this agent's Setoff balance. */
export async function repayCredit(agent: Agent, input: { lender: Address; amount: string; token: Token }) {
  const amount = parseUnits(input.amount, 6);
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  return send(agent, { address: net.setoff, abi: setoffAbi, functionName: "repay", args: [input.lender, tokenAddress(input.token), amount] });
}
