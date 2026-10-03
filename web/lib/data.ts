import { createPublicClient, getAbiItem, hexToString, http, parseEventLogs, keccak256, toHex, type Address, type Hex, type Log } from "viem";
import { setoffAbi } from "./setoffAbi";
import { memoAbi } from "./memoAbi";
import { identities, MEMO, net } from "./config";
import { loadIdentities } from "./identity";
import { decodeInvoice, INVOICE_REQUEST_ID, iouId, type Invoice } from "./invoice";

export const client = createPublicClient({
  chain: net.chain,
  // Fewer HTTP requests: reads made together go out as one multicall, and concurrent calls as one JSON-RPC batch.
  batch: { multicall: true },
  // The public RPC rate-limits bursts: back off and retry (400ms, 800ms, … up to ~25s).
  transport: http(net.rpc, { retryCount: 6, retryDelay: 400, batch: { batchSize: 20, wait: 16 } }),
});

export type IOURow = {
  id: Hex;
  debtor: Address;
  creditor: Address;
  token: Address;
  /** Current face value (a resolved dispute can lower it). */
  amount: bigint;
  /** Paid so far across cycles; less than `amount` while open = partly paid. */
  paid: bigint;
  /** Each cycle that paid part (or all) of it. */
  payments: { cycle: bigint; amount: bigint }[];
  deadline: bigint;
  ref: Hex;
  status: "pending" | "settled" | "cancelled" | "expired" | "disputed";
  /** Open dispute proposals for what is still owed. */
  offers?: { debtor?: bigint; creditor?: bigint };
  cycle?: bigint;
  note?: string;
  submittedTx: Hex;
  submittedAt?: bigint;
};

export type CycleRow = {
  cycle: bigint;
  solver: Address;
  iouCount: bigint;
  tx: Hex;
  block: bigint;
  timestamp?: bigint;
  /** per token address (lower-case) */
  gross: Record<string, bigint>;
  netFunded: Record<string, bigint>;
  memo?: string;
  /** USDC↔EURC conversions between opted-in parties in this cycle. */
  fx: FxRow[];
};

export type FxRow = { account: Address; sell: Address; sellAmount: bigint; buy: Address; buyAmount: bigint };

/** An invoice the creditor posted to Arc for the debtor to review. */
export type InvoiceRequest = { id: Hex; param: string; invoice: Invoice; tx: Hex; block: bigint };

export type CreditLineRow = { lender: Address; borrower: Address; token: Address; limit: bigint; used: bigint };

export type Snapshot = {
  tokens: Address[];
  creditLines: CreditLineRow[];
  /** Invoices sent through Arc that the debtor hasn't added yet (not yet onchain as IOUs, not expired). */
  invoiceRequests: InvoiceRequest[];
  /** FX opt-ins: minimum rate (1e6 = 1:1) by `${account}:${sell}:${buy}`, lower-case. */
  fxPrefs: Record<string, bigint>;
  /** Published private-note public keys, by lower-case address (hex, 32 bytes). */
  noteKeys: Record<string, Hex>;
  ious: IOURow[];
  cycles: CycleRow[];
  head: bigint;
  now: bigint;
};

// Arc RPCs cap eth_getLogs at 10,000 blocks.
const RANGE = 10_000n;

// Logs already fetched, per query: each refresh only asks for blocks after `to`.
const logCache = new Map<string, { to: bigint; logs: unknown[] }>();

/** Logs from the deploy block to `head`, in 10k-block windows, fetched incrementally. */
export async function logsInWindows<T>(key: string, fetchWindow: (from: bigint, to: bigint) => Promise<T[]>, head: bigint): Promise<T[]> {
  const cached = logCache.get(key) as { to: bigint; logs: T[] } | undefined;
  const start = cached ? cached.to + 1n : net.deployBlock;
  const windows: [bigint, bigint][] = [];
  for (let from = start; from <= head; from += RANGE) {
    const to = from + RANGE - 1n;
    windows.push([from, to > head ? head : to]);
  }
  const out: T[] = cached ? [...cached.logs] : [];
  for (let i = 0; i < windows.length; i += 3) {
    const batch = await Promise.all(windows.slice(i, i + 3).map(([a, b]) => fetchWindow(a, b)));
    for (const logs of batch) out.push(...logs);
  }
  logCache.set(key, { to: head > (cached?.to ?? 0n) ? head : cached!.to, logs: out });
  return out;
}

const cycleMemoId = (cycle: bigint) => keccak256(toHex(`setoff:cycle:${cycle}`));
/** Memo id under which a wallet publishes its private-note public key. */
export const NOTE_KEY_ID = keccak256(toHex("setoff:notekey:v1"));

/** Everything the dashboard shows, rebuilt from onchain events. */
export async function loadSnapshot(): Promise<Snapshot> {
  const [head, block, tokens] = await Promise.all([
    client.getBlockNumber({ cacheTime: 0 }),
    client.getBlock(),
    client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "tokens" }),
  ]);

  const setoffEvents = setoffAbi.filter(
    (x) => x.type === "event" && [
        "IOUSubmitted",
        "IOUSettled",
        "IOUCancelled",
        "IOUDisputed",
        "IOUOffer",
        "IOUResolved",
        "CycleSettled",
        "CreditLineSet",
        "CreditDrawn",
        "CreditRepaid",
        "FxPreferenceSet",
        "Converted",
      ].includes(x.name),
  );
  const [logs, memoLogs] = await Promise.all([
    logsInWindows(
      "setoff",
      // No topic filter: Arc's RPC rejects more than ~10 topics ("requested range too large").
      async (fromBlock, toBlock) => parseEventLogs({ abi: setoffEvents, logs: await client.getLogs({ address: net.setoff, fromBlock, toBlock }), strict: true }),
      head,
    ),
    logsInWindows(
      "memo",
      (fromBlock, toBlock) =>
        client.getLogs({
          address: MEMO,
          event: getAbiItem({ abi: memoAbi, name: "Memo" }),
          args: { target: net.setoff },
          fromBlock,
          toBlock,
        }),
      head,
    ),
  ]);

  const memos = new Map<string, string>();
  const noteKeys: Record<string, Hex> = {};
  const requests = new Map<Hex, InvoiceRequest>();
  for (const m of memoLogs) {
    if (!m.args.memoId || !m.args.memo) continue;
    // Invoices sent to a debtor. Only the creditor named in the invoice can send it.
    if (m.args.memoId === INVOICE_REQUEST_ID) {
      try {
        const param = hexToString(m.args.memo);
        const invoice = decodeInvoice(param);
        if (m.args.sender?.toLowerCase() === invoice.iou.creditor.toLowerCase())
          requests.set(iouId(invoice.iou), { id: iouId(invoice.iou), param, invoice, tx: m.transactionHash!, block: m.blockNumber! });
      } catch {}
      continue;
    }
    // Private-note keys are raw 32-byte public keys, published once per wallet (latest wins).
    if (m.args.memoId === NOTE_KEY_ID) {
      if (m.args.sender && m.args.memo.length === 66) noteKeys[m.args.sender.toLowerCase()] = m.args.memo;
      continue;
    }
    try {
      memos.set(m.args.memoId, hexToString(m.args.memo));
    } catch {
      // Non-UTF-8 memo payloads are ignored.
    }
  }

  const ious = new Map<Hex, IOURow>();
  const lines = new Map<string, CreditLineRow>();
  const fxPrefs: Record<string, bigint> = {};
  const fxByCycle = new Map<string, FxRow[]>();
  const cycles: CycleRow[] = [];
  for (const log of logs as (Log & { eventName: string; args: Record<string, unknown> })[]) {
    const a = log.args;
    if (log.eventName === "IOUSubmitted") {
      const row: IOURow = {
        id: a.id as Hex,
        debtor: a.debtor as Address,
        creditor: a.creditor as Address,
        token: a.token as Address,
        amount: a.amount as bigint,
        paid: 0n,
        payments: [],
        deadline: a.deadline as bigint,
        ref: a.ref as Hex,
        status: "pending",
        submittedTx: log.transactionHash!,
        note: memos.get(a.ref as Hex),
      };
      ious.set(row.id, row);
    } else if (log.eventName === "IOUSettled") {
      const row = ious.get(a.id as Hex);
      if (row) {
        row.paid += a.amount as bigint;
        row.payments.push({ cycle: a.cycle as bigint, amount: a.amount as bigint });
        row.cycle = a.cycle as bigint;
        if ((a.remaining as bigint) === 0n) row.status = "settled";
      }
    } else if (log.eventName === "IOUCancelled") {
      const row = ious.get(a.id as Hex);
      if (row) row.status = "cancelled";
    } else if (log.eventName === "IOUDisputed") {
      const row = ious.get(a.id as Hex);
      if (row) {
        row.status = "disputed";
        row.offers = {};
      }
    } else if (log.eventName === "IOUOffer") {
      const row = ious.get(a.id as Hex);
      if (row) {
        row.offers ??= {};
        const by = (a.by as string).toLowerCase();
        if (by === row.debtor.toLowerCase()) row.offers.debtor = a.amount as bigint;
        else row.offers.creditor = a.amount as bigint;
      }
    } else if (log.eventName === "IOUResolved") {
      const row = ious.get(a.id as Hex);
      if (row) {
        const remaining = a.remaining as bigint;
        row.amount = row.paid + remaining;
        row.status = remaining > 0n ? "pending" : row.paid > 0n ? "settled" : "cancelled";
        row.offers = undefined;
      }
    } else if (log.eventName === "CreditLineSet") {
      const k = `${a.lender}:${a.borrower}:${a.token}`.toLowerCase();
      const line = lines.get(k) ?? { lender: a.lender as Address, borrower: a.borrower as Address, token: a.token as Address, limit: 0n, used: 0n };
      line.limit = a.limit as bigint;
      lines.set(k, line);
    } else if (log.eventName === "CreditDrawn" || log.eventName === "CreditRepaid") {
      const k = `${a.lender}:${a.borrower}:${a.token}`.toLowerCase();
      const line = lines.get(k);
      if (line) line.used += log.eventName === "CreditDrawn" ? (a.amount as bigint) : -(a.amount as bigint);
    } else if (log.eventName === "FxPreferenceSet") {
      fxPrefs[`${a.account}:${a.sell}:${a.buy}`.toLowerCase()] = BigInt(a.minRate as bigint);
    } else if (log.eventName === "Converted") {
      const k = String(a.cycle);
      fxByCycle.set(k, [...(fxByCycle.get(k) ?? []), { account: a.account as Address, sell: a.sell as Address, sellAmount: a.sellAmount as bigint, buy: a.buy as Address, buyAmount: a.buyAmount as bigint }]);
    } else if (log.eventName === "CycleSettled") {
      const gross: Record<string, bigint> = {};
      const netFunded: Record<string, bigint> = {};
      (a.gross as bigint[]).forEach((g, i) => (gross[tokens[i]!.toLowerCase()] = g));
      (a.netFunded as bigint[]).forEach((n, i) => (netFunded[tokens[i]!.toLowerCase()] = n));
      cycles.push({
        cycle: a.cycle as bigint,
        solver: a.solver as Address,
        iouCount: a.iouCount as bigint,
        tx: log.transactionHash!,
        block: log.blockNumber!,
        gross,
        netFunded,
        memo: memos.get(cycleMemoId(a.cycle as bigint)),
        fx: fxByCycle.get(String(a.cycle)) ?? [],
      });
    }
  }

  // Timestamps for the cycles (few, so one call each is fine).
  await Promise.all(
    cycles.slice(-50).map(async (c) => {
      c.timestamp = (await client.getBlock({ blockNumber: c.block })).timestamp;
    }),
  );

  for (const i of ious.values()) if (i.status === "pending" && i.deadline < block.timestamp) i.status = "expired";

  const parties = new Set<Address>();
  for (const i of ious.values()) parties.add(i.debtor).add(i.creditor);
  // Names are a nicety: a registry hiccup must not take the dashboard down.
  try {
    const found = await loadIdentities([...parties], head);
    for (const [k, v] of found) identities.set(k, v);
  } catch {}

  const invoiceRequests = [...requests.values()].filter((r) => !ious.has(r.id) && r.invoice.iou.deadline > block.timestamp).reverse();
  return { tokens: [...tokens], creditLines: [...lines.values()], invoiceRequests, fxPrefs, noteKeys, ious: [...ious.values()].reverse(), cycles: cycles.reverse(), head, now: block.timestamp };
}

/** What is still owed on a bill. */
export const remainingOf = (i: IOURow) => i.amount - i.paid;

export type Totals = { gross: Record<string, bigint>; netFunded: Record<string, bigint>; settledIous: number };

export function totals(s: Snapshot): Totals {
  const gross: Record<string, bigint> = {};
  const netFunded: Record<string, bigint> = {};
  for (const c of s.cycles) {
    for (const [t, g] of Object.entries(c.gross)) gross[t] = (gross[t] ?? 0n) + g;
    for (const [t, n] of Object.entries(c.netFunded)) netFunded[t] = (netFunded[t] ?? 0n) + n;
  }
  return { gross, netFunded, settledIous: s.ious.filter((i) => i.status === "settled").length };
}

/** Share of face value that never had to move, in basis points. */
export function savedBps(gross: bigint, netFunded: bigint) {
  if (gross === 0n) return 0;
  return Number(((gross - netFunded) * 10_000n) / gross);
}
