import type { Address, Hex } from "viem";

export type PendingIOU = {
  id: Hex;
  debtor: Address;
  creditor: Address;
  token: Address;
  /** What is still owed (face value minus anything already paid). */
  amount: bigint;
  deadline: bigint;
};

/** Credit a lender has extended to a borrower that is still available to draw. */
export type CreditLine = { lender: Address; borrower: Address; token: Address; available: bigint };

/** One credit draw for `settle`: `lender` funds `amount` of `borrower`'s shortfall. */
export type Draw = { borrower: Address; lender: Address; token: Address; amount: bigint };

/** Deposit balance per `${account}:${token}`, lower-cased. */
export type Balances = Map<string, bigint>;

export type Selection = {
  ids: Hex[];
  /** How much of each IOU (same order as `ids`) this cycle pays. Less than owed = partial. */
  amounts: bigint[];
  /** Credit draws that fund shortfalls. */
  draws: Draw[];
  /** IOUs paid only in part this cycle. */
  partial: number;
  /** Every debtor and creditor in `ids`, ascending as uint160 — what `settle` expects. */
  parties: Address[];
  /** Face value cleared, per token. */
  gross: Map<Address, bigint>;
  /** Liquidity debited from net debtors, per token. */
  netFunded: Map<Address, bigint>;
};

export const MAX_IOUS_PER_CYCLE = 256;

export const balanceKey = (account: string, token: string) =>
  `${account.toLowerCase()}:${token.toLowerCase()}`;

function netPositions(ious: Iterable<PendingIOU>): Map<string, bigint> {
  const nets = new Map<string, bigint>();
  for (const iou of ious) {
    const d = balanceKey(iou.debtor, iou.token);
    const c = balanceKey(iou.creditor, iou.token);
    nets.set(d, (nets.get(d) ?? 0n) - iou.amount);
    nets.set(c, (nets.get(c) ?? 0n) + iou.amount);
  }
  return nets;
}

/** Net debtors whose deposit cannot cover their position, worst first. */
function shortfalls(ious: Iterable<PendingIOU>, balances: Balances) {
  const out: { key: string; short: bigint }[] = [];
  for (const [key, net] of netPositions(ious)) {
    if (net >= 0n) continue;
    const short = -net - (balances.get(key) ?? 0n);
    if (short > 0n) out.push({ key, short });
  }
  return out.sort((a, b) => (b.short > a.short ? 1 : b.short < a.short ? -1 : 0));
}

const isFeasible = (ious: Iterable<PendingIOU>, balances: Balances) =>
  shortfalls(ious, balances).length === 0;

const totalShortfall = (ious: Iterable<PendingIOU>, balances: Balances) =>
  shortfalls(ious, balances).reduce((sum, s) => sum + s.short, 0n);

/**
 * Choose a fundable subset of the pool that clears as much face value as possible.
 *
 * Exact maximisation is a knapsack variant, so this is a greedy repair: start from
 * every eligible IOU, and while the worst-funded net debtor is short, drop whichever
 * of their IOUs leaves the least total shortfall across all parties (ties: drop the
 * smaller). Scoring globally matters — the "obvious" drop can be an IOU that was
 * offsetting someone else's debt. Then retry the dropped IOUs largest-first.
 */
export function selectCycle(
  pool: PendingIOU[],
  balances: Balances,
  now: bigint,
  maxIous = MAX_IOUS_PER_CYCLE,
  lines: CreditLine[] = [],
): Selection | null {
  // Leave headroom so an IOU cannot expire between selection and inclusion.
  const eligible = pool
    .filter((iou) => iou.deadline >= now + 60n)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0))
    .slice(0, maxIous);

  const chosen = new Map(eligible.map((iou) => [iou.id, iou]));
  const dropped: PendingIOU[] = [];

  for (;;) {
    const worst = shortfalls(chosen.values(), balances)[0];
    if (!worst) break;
    const [account, token] = worst.key.split(":");
    const theirs = [...chosen.values()].filter(
      (iou) => iou.debtor.toLowerCase() === account && iou.token.toLowerCase() === token,
    );
    let victim: PendingIOU | undefined;
    let best = 0n;
    for (const candidate of theirs) {
      chosen.delete(candidate.id);
      const after = totalShortfall(chosen.values(), balances);
      chosen.set(candidate.id, candidate);
      if (!victim || after < best || (after === best && candidate.amount < victim.amount)) {
        victim = candidate;
        best = after;
      }
    }
    // A negative net always comes from at least one IOU where this party is debtor.
    if (!victim) throw new Error(`no IOU to drop for ${worst.key}`);
    chosen.delete(victim.id);
    dropped.push(victim);
  }

  dropped.sort((a, b) => (a.amount > b.amount ? -1 : 1));
  for (const iou of dropped) {
    chosen.set(iou.id, iou);
    if (!isFeasible(chosen.values(), balances)) chosen.delete(iou.id);
  }
  let rest = dropped.filter((d) => !chosen.has(d.id));

  // Pay amounts per IOU; full by default.
  const pay = new Map<Hex, bigint>([...chosen.values()].map((i) => [i.id, i.amount]));
  const draws: Draw[] = [];
  const drawnIn = new Map<string, bigint>(); // borrower:token → drawn this cycle
  const drawnOut = new Map<string, bigint>(); // lender:token → lent this cycle
  const lineUsed = new Map<string, bigint>(); // lender:borrower:token → drawn this cycle

  const netsNow = () => {
    const nets = new Map<string, bigint>();
    for (const i of chosen.values()) {
      const amt = pay.get(i.id)!;
      const d = balanceKey(i.debtor, i.token);
      const c = balanceKey(i.creditor, i.token);
      nets.set(d, (nets.get(d) ?? 0n) - amt);
      nets.set(c, (nets.get(c) ?? 0n) + amt);
    }
    return nets;
  };
  // What an account could still put into this cycle: deposit + credit drawn − credit lent − its own net debt.
  const slack = (key: string, nets: Map<string, bigint>) => {
    const net = nets.get(key) ?? 0n;
    return (balances.get(key) ?? 0n) + (drawnIn.get(key) ?? 0n) - (drawnOut.get(key) ?? 0n) - (net < 0n ? -net : 0n);
  };

  // Credit pass: add whole IOUs whose debtor is short but has lenders with room and funds.
  for (const iou of rest) {
    const nets = netsNow();
    const dk = balanceKey(iou.debtor, iou.token);
    let deficit = iou.amount - slack(dk, nets);
    if (deficit <= 0n) continue;
    const plan: Draw[] = [];
    for (const line of lines) {
      if (deficit <= 0n) break;
      if (line.borrower.toLowerCase() !== iou.debtor.toLowerCase() || line.token.toLowerCase() !== iou.token.toLowerCase()) continue;
      const lk = `${line.lender.toLowerCase()}:${dk}`;
      const room = line.available - (lineUsed.get(lk) ?? 0n);
      const lenderFree = slack(balanceKey(line.lender, line.token), nets);
      const take = [room, lenderFree, deficit].reduce((m, v) => (v < m ? v : m));
      if (take <= 0n) continue;
      plan.push({ borrower: iou.debtor, lender: line.lender, token: iou.token, amount: take });
      deficit -= take;
    }
    if (deficit > 0n) continue; // not enough credit for the whole bill; partial pass may still help
    for (const d of plan) {
      draws.push(d);
      const bk = balanceKey(d.borrower, d.token);
      const lk = balanceKey(d.lender, d.token);
      drawnIn.set(bk, (drawnIn.get(bk) ?? 0n) + d.amount);
      drawnOut.set(lk, (drawnOut.get(lk) ?? 0n) + d.amount);
      const uk = `${d.lender.toLowerCase()}:${bk}`;
      lineUsed.set(uk, (lineUsed.get(uk) ?? 0n) + d.amount);
    }
    chosen.set(iou.id, iou);
    pay.set(iou.id, iou.amount);
  }
  rest = rest.filter((d) => !chosen.has(d.id));

  // Partial pass: pay whatever each remaining debtor can still cover.
  let partial = 0;
  for (const iou of rest) {
    if (chosen.size >= maxIous) break;
    const can = slack(balanceKey(iou.debtor, iou.token), netsNow());
    if (can <= 0n) continue;
    const amt = can < iou.amount ? can : iou.amount;
    chosen.set(iou.id, iou);
    pay.set(iou.id, amt);
    if (amt < iou.amount) partial++;
  }

  if (chosen.size === 0) return null;

  const gross = new Map<Address, bigint>();
  const partySet = new Map<string, Address>();
  for (const iou of chosen.values()) {
    gross.set(iou.token, (gross.get(iou.token) ?? 0n) + pay.get(iou.id)!);
    partySet.set(iou.debtor.toLowerCase(), iou.debtor);
    partySet.set(iou.creditor.toLowerCase(), iou.creditor);
  }
  const netFunded = new Map<Address, bigint>();
  for (const [key, net] of netsNow()) {
    if (net >= 0n) continue;
    const token = [...gross.keys()].find((t) => t.toLowerCase() === key.split(":")[1]);
    if (token) netFunded.set(token, (netFunded.get(token) ?? 0n) - net);
  }

  const parties = [...partySet.values()].sort((a, b) => {
    const x = BigInt(a);
    const y = BigInt(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });

  // One draw per (borrower, lender, token), however many bills it funded.
  const merged = new Map<string, Draw>();
  for (const d of draws) {
    const k = `${d.borrower}:${d.lender}:${d.token}`.toLowerCase();
    const m = merged.get(k);
    if (m) m.amount += d.amount;
    else merged.set(k, { ...d });
  }

  const ids = [...chosen.keys()];
  return { ids, amounts: ids.map((id) => pay.get(id)!), draws: [...merged.values()], partial, parties, gross, netFunded };
}
