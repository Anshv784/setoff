import type { Address } from "viem";
import { balanceKey, selectCycle, type Balances, type CreditLine, type PendingIOU, type Selection } from "./select.ts";

/** An account's standing permission to convert its leftover `sell` net into `buy`. */
export type FxPref = { account: Address; sell: Address; buy: Address; minRate: bigint };

/** One leg for `settle`: `account` gives `sellAmount` of `sell` for `buyAmount` of `buy`. */
export type Conversion = { account: Address; sell: Address; buy: Address; sellAmount: bigint; buyAmount: bigint };

const RATE = 1_000_000n; // rates are buy units per sell unit, scaled by 1e6

/**
 * Pair opted-in parties with opposite leftovers: one is owed EURC and owes USDC, the other
 * the reverse. Each pair swaps at `usdPerEur` (scaled 1e6), and only if that rate meets both
 * of their minimums. Nobody else is touched, and per token what's sold equals what's bought.
 */
export function matchFx(
  nets: Map<string, bigint>,
  prefs: FxPref[],
  usdc: Address,
  eurc: Address,
  usdPerEur: bigint,
): Conversion[] {
  const eurPerUsd = (RATE * RATE) / usdPerEur;
  const min = new Map(prefs.map((p) => [`${p.account}:${p.sell}:${p.buy}`.toLowerCase(), p.minRate]));
  const left = new Map(nets);
  const net = (a: Address, t: Address) => left.get(balanceKey(a, t)) ?? 0n;
  const accounts = [...new Set(prefs.map((p) => p.account))];
  // Sellers of EURC (owed EURC, owe USDC) and sellers of USDC (the reverse), whose floors the rate meets.
  const eurSellers = accounts.filter((a) => (min.get(`${a}:${eurc}:${usdc}`.toLowerCase()) ?? 0n) > 0n && min.get(`${a}:${eurc}:${usdc}`.toLowerCase())! <= usdPerEur);
  const usdSellers = accounts.filter((a) => (min.get(`${a}:${usdc}:${eurc}`.toLowerCase()) ?? 0n) > 0n && min.get(`${a}:${usdc}:${eurc}`.toLowerCase())! <= eurPerUsd);
  const out: Conversion[] = [];
  for (const a of eurSellers) {
    for (const b of usdSellers) {
      if (a.toLowerCase() === b.toLowerCase()) continue;
      // EUR amount q: bounded by what a is owed in EUR and b owes in EUR, and the USD each side can absorb.
      const caps = [net(a, eurc), -net(a, usdc), -net(b, eurc), net(b, usdc)];
      if (caps.some((c) => c <= 0n)) continue;
      let q = caps[0]! < -net(b, eurc) ? caps[0]! : -net(b, eurc);
      const usdRoom = -net(a, usdc) < net(b, usdc) ? -net(a, usdc) : net(b, usdc);
      if ((q * usdPerEur) / RATE > usdRoom) q = (usdRoom * RATE) / usdPerEur;
      const u = (q * usdPerEur) / RATE;
      if (q === 0n || u === 0n) continue;
      // The rate each side actually gets after rounding must still meet its floor.
      if ((u * RATE) / q < min.get(`${a}:${eurc}:${usdc}`.toLowerCase())!) continue;
      if ((q * RATE) / u < min.get(`${b}:${usdc}:${eurc}`.toLowerCase())!) continue;
      out.push({ account: a, sell: eurc, buy: usdc, sellAmount: q, buyAmount: u });
      out.push({ account: b, sell: usdc, buy: eurc, sellAmount: u, buyAmount: q });
      left.set(balanceKey(a, eurc), net(a, eurc) - q);
      left.set(balanceKey(a, usdc), net(a, usdc) + u);
      left.set(balanceKey(b, eurc), net(b, eurc) + q);
      left.set(balanceKey(b, usdc), net(b, usdc) - u);
    }
  }
  return out;
}

export function netsOf(ious: { debtor: Address; creditor: Address; token: Address; amount: bigint }[]) {
  const nets = new Map<string, bigint>();
  for (const i of ious) {
    nets.set(balanceKey(i.debtor, i.token), (nets.get(balanceKey(i.debtor, i.token)) ?? 0n) - i.amount);
    nets.set(balanceKey(i.creditor, i.token), (nets.get(balanceKey(i.creditor, i.token)) ?? 0n) + i.amount);
  }
  return nets;
}

/** What a conversion does to deposits needed: buying covers debt, like a deposit would. */
function virtualBalances(balances: Balances, fx: Conversion[]): Balances {
  const out = new Map(balances);
  for (const c of fx) out.set(balanceKey(c.account, c.buy), (out.get(balanceKey(c.account, c.buy)) ?? 0n) + c.buyAmount);
  return out;
}

function fundable(sel: Selection, pool: PendingIOU[], balances: Balances, fx: Conversion[]) {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const nets = netsOf(sel.ids.map((id, i) => ({ ...byId.get(id)!, amount: sel.amounts[i]! })));
  const have = new Map(balances);
  const add = (k: string, v: bigint) => have.set(k, (have.get(k) ?? 0n) + v);
  for (const d of sel.draws) {
    add(balanceKey(d.borrower, d.token), d.amount);
    add(balanceKey(d.lender, d.token), -d.amount);
  }
  for (const c of fx) {
    nets.set(balanceKey(c.account, c.sell), (nets.get(balanceKey(c.account, c.sell)) ?? 0n) - c.sellAmount);
    nets.set(balanceKey(c.account, c.buy), (nets.get(balanceKey(c.account, c.buy)) ?? 0n) + c.buyAmount);
  }
  for (const [k, n] of nets) if (n + (have.get(k) ?? 0n) < 0n) return false;
  for (const v of have.values()) if (v < 0n) return false;
  return true;
}

export type FxSelection = Selection & { fx: Conversion[] };

/**
 * Pick a cycle with conversions if they let more value clear; otherwise the plain cycle.
 * Conversions are recomputed on the bills actually chosen, and the result is only used if
 * it is still fully funded, so a party outside its limit simply stays in its own currency.
 */
export function selectWithFx(
  pool: PendingIOU[],
  balances: Balances,
  now: bigint,
  lines: CreditLine[],
  prefs: FxPref[],
  usdc: Address,
  eurc: Address,
  usdPerEur: bigint | null,
): FxSelection | null {
  const plain = selectCycle(pool, balances, now, undefined, lines);
  const base = plain ? { ...plain, fx: [] } : null;
  if (!usdPerEur || prefs.length === 0) return base;
  const guess = matchFx(netsOf(pool), prefs, usdc, eurc, usdPerEur);
  if (guess.length === 0) return base;
  const sel = selectCycle(pool, virtualBalances(balances, guess), now, undefined, lines);
  if (!sel) return base;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const fx = matchFx(netsOf(sel.ids.map((id, i) => ({ ...byId.get(id)!, amount: sel.amounts[i]! }))), prefs, usdc, eurc, usdPerEur);
  if (fx.length === 0 || !fundable(sel, pool, balances, fx)) return base;
  const value = (s: Selection) =>
    [...s.gross.entries()].reduce((v, [t, g]) => v + (t.toLowerCase() === eurc.toLowerCase() ? (g * usdPerEur) / RATE : g), 0n);
  if (plain && value(sel) < value(plain)) return base;
  // What net debtors actually fund once conversions have offset their leftovers.
  const nets = netsOf(sel.ids.map((id, i) => ({ ...byId.get(id)!, amount: sel.amounts[i]! })));
  for (const c of fx) {
    nets.set(balanceKey(c.account, c.sell), (nets.get(balanceKey(c.account, c.sell)) ?? 0n) - c.sellAmount);
    nets.set(balanceKey(c.account, c.buy), (nets.get(balanceKey(c.account, c.buy)) ?? 0n) + c.buyAmount);
  }
  const netFunded = new Map<Address, bigint>();
  for (const t of sel.gross.keys()) netFunded.set(t, 0n);
  for (const [k, n] of nets) {
    const t = [...sel.gross.keys()].find((x) => x.toLowerCase() === k.split(":")[1]);
    if (n < 0n && t) netFunded.set(t, netFunded.get(t)! - n);
  }
  return { ...sel, netFunded, fx };
}

/** Reference USDC-per-EURC rate (1e6 scale): SETOFF_FX_RATE if set, else the ECB rate. */
export async function referenceRate(): Promise<bigint | null> {
  if (process.env.SETOFF_FX_RATE) return BigInt(Math.round(Number(process.env.SETOFF_FX_RATE) * 1e6));
  try {
    const r = (await (await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD")).json()) as { rates?: { USD?: number } };
    return r.rates?.USD ? BigInt(Math.round(r.rates.USD * 1e6)) : null;
  } catch {
    return null;
  }
}
