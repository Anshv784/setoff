import type { Address, Hex } from "viem";

export type PendingIOU = {
  id: Hex;
  debtor: Address;
  creditor: Address;
  token: Address;
  amount: bigint;
  deadline: bigint;
};

/** Deposit balance per `${account}:${token}`, lower-cased. */
export type Balances = Map<string, bigint>;

export type Selection = {
  ids: Hex[];
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

  if (chosen.size === 0) return null;

  const gross = new Map<Address, bigint>();
  const partySet = new Map<string, Address>();
  for (const iou of chosen.values()) {
    gross.set(iou.token, (gross.get(iou.token) ?? 0n) + iou.amount);
    partySet.set(iou.debtor.toLowerCase(), iou.debtor);
    partySet.set(iou.creditor.toLowerCase(), iou.creditor);
  }
  const netFunded = new Map<Address, bigint>();
  for (const [key, net] of netPositions(chosen.values())) {
    if (net >= 0n) continue;
    const token = [...gross.keys()].find((t) => t.toLowerCase() === key.split(":")[1]);
    if (token) netFunded.set(token, (netFunded.get(token) ?? 0n) - net);
  }

  const parties = [...partySet.values()].sort((a, b) => {
    const x = BigInt(a);
    const y = BigInt(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });

  return { ids: [...chosen.keys()], parties, gross, netFunded };
}
