import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { balanceKey, selectCycle, type Balances, type PendingIOU } from "./select.ts";

const A = "0x00000000000000000000000000000000000000aa" as Address;
const B = "0x00000000000000000000000000000000000000bb" as Address;
const C = "0x00000000000000000000000000000000000000cc" as Address;
const USDC = "0x3600000000000000000000000000000000000000" as Address;
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;
const NOW = 1_000_000n;

let n = 0;
const iou = (debtor: Address, creditor: Address, amount: bigint, token = USDC): PendingIOU => ({
  id: `0x${(++n).toString(16).padStart(64, "0")}` as Hex,
  debtor,
  creditor,
  token,
  amount,
  deadline: NOW + 86_400n,
});
/** Ids the selection pays in full (partial pieces excluded). */
const fullIds = (s: { ids: Hex[]; amounts: bigint[] }, pool: PendingIOU[]) =>
  new Set(s.ids.filter((id, i) => s.amounts[i] === pool.find((p) => p.id === id)!.amount));
const bal = (entries: [Address, bigint, Address?][]): Balances =>
  new Map(entries.map(([a, v, t]) => [balanceKey(a, t ?? USDC), v]));

test("triangle clears 27 with 2 of liquidity", () => {
  const pool = [iou(A, B, 10n), iou(B, C, 9n), iou(C, A, 8n)];
  const s = selectCycle(pool, bal([[A, 2n]]), NOW);
  assert.ok(s);
  assert.equal(s.ids.length, 3);
  assert.equal(s.gross.get(USDC), 27n);
  assert.equal(s.netFunded.get(USDC), 2n);
  assert.deepEqual(s.parties, [A, B, C]);
});

test("drops only the IOU the debtor cannot fund", () => {
  // A can fund 5 of their 15 owed; dropping the 10 keeps the rest clearing.
  const keep = iou(A, B, 5n);
  const drop = iou(A, C, 10n);
  const other = iou(B, C, 3n);
  const s = selectCycle([keep, drop, other], bal([[A, 5n], [B, 0n]]), NOW);
  assert.ok(s);
  assert.deepEqual(new Set(s.ids), new Set([keep.id, other.id]));
});

test("scores drops globally, keeping offsetting IOUs", () => {
  // B is short 1. Dropping B->A (the smallest IOU covering it) cascades to an empty
  // cycle; dropping B->C instead keeps A<->B clearing 11.
  const ab = iou(A, B, 7n);
  const ba = iou(B, A, 4n);
  const pool = [ab, ba, iou(B, C, 6n), iou(C, A, 1n)];
  const s = selectCycle(pool, bal([[A, 3n], [B, 2n]]), NOW);
  assert.ok(s);
  // Whole bills: A<->B. The partial pass may then add part of another bill on top.
  assert.deepEqual(fullIds(s, pool), new Set([ab.id, ba.id]));
});

test("currencies never offset each other", () => {
  const pool = [iou(A, B, 5n, USDC), iou(B, A, 5n, EURC)];
  assert.equal(selectCycle(pool, bal([]), NOW), null);
  const s = selectCycle(pool, bal([[A, 5n, USDC], [B, 5n, EURC]]), NOW);
  assert.equal(s?.ids.length, 2);
});

test("skips IOUs about to expire", () => {
  const late = { ...iou(A, B, 1n), deadline: NOW + 30n };
  assert.equal(selectCycle([late], bal([[A, 1n]]), NOW), null);
});

test("caps cycle size, most urgent first", () => {
  const pool = Array.from({ length: 5 }, (_, i) => ({ ...iou(A, B, 1n), deadline: NOW + 1000n + BigInt(5 - i) }));
  const s = selectCycle(pool, bal([[A, 10n]]), NOW, 2);
  assert.deepEqual(s?.ids, [pool[4]!.id, pool[3]!.id]);
});

test("random pools always yield feasible selections", () => {
  const people = [A, B, C, "0x00000000000000000000000000000000000000dd" as Address];
  let seed = 7;
  const rnd = (m: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % m);
  for (let round = 0; round < 300; round++) {
    const pool: PendingIOU[] = [];
    for (let i = 0; i < 12; i++) {
      const d = rnd(4);
      const c = (d + 1 + rnd(3)) % 4;
      pool.push(iou(people[d]!, people[c]!, BigInt(1 + rnd(50)), rnd(2) ? USDC : EURC));
    }
    const balances = bal(people.flatMap((p) => [[p, BigInt(rnd(60)), USDC], [p, BigInt(rnd(60)), EURC]] as [Address, bigint, Address][]));
    const s = selectCycle(pool, balances, NOW);
    if (!s) continue;
    const nets = new Map<string, bigint>();
    s.ids.forEach((id, i) => {
      const p = pool.find((x) => x.id === id)!;
      const amt = s.amounts[i]!;
      nets.set(balanceKey(p.debtor, p.token), (nets.get(balanceKey(p.debtor, p.token)) ?? 0n) - amt);
      nets.set(balanceKey(p.creditor, p.token), (nets.get(balanceKey(p.creditor, p.token)) ?? 0n) + amt);
    });
    for (const [k, net] of nets) assert.ok(net >= 0n || -net <= (balances.get(k) ?? 0n), `round ${round}: ${k}`);
    const sum = [...nets.values()].reduce((x, y) => x + y, 0n);
    assert.equal(sum, 0n);
  }
});

const feasible = (chosen: PendingIOU[], balances: Balances) => {
  const nets = new Map<string, bigint>();
  for (const p of chosen) {
    nets.set(balanceKey(p.debtor, p.token), (nets.get(balanceKey(p.debtor, p.token)) ?? 0n) - p.amount);
    nets.set(balanceKey(p.creditor, p.token), (nets.get(balanceKey(p.creditor, p.token)) ?? 0n) + p.amount);
  }
  for (const [k, net] of nets) if (net < 0n && -net > (balances.get(k) ?? 0n)) return false;
  return true;
};

test("greedy is close to brute-force optimal on small pools", () => {
  const people = [A, B, C, "0x00000000000000000000000000000000000000dd" as Address];
  let seed = 99;
  const rnd = (m: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % m);
  let greedyTotal = 0n;
  let optimalTotal = 0n;
  let exact = 0;
  const rounds = 200;
  for (let round = 0; round < rounds; round++) {
    const pool: PendingIOU[] = [];
    for (let i = 0; i < 10; i++) {
      const d = rnd(4);
      pool.push(iou(people[d]!, people[(d + 1 + rnd(3)) % 4]!, BigInt(1 + rnd(40))));
    }
    const balances = bal(people.map((p) => [p, BigInt(rnd(30))] as [Address, bigint]));
    let best = 0n;
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const subset = pool.filter((_, i) => mask & (1 << i));
      if (!feasible(subset, balances)) continue;
      const g = subset.reduce((x, p) => x + p.amount, 0n);
      if (g > best) best = g;
    }
    // Benchmark whole-bill selection (what brute force searches); partial pieces come on top.
    const sel = selectCycle(pool, balances, NOW);
    const full = sel ? fullIds(sel, pool) : new Set<Hex>();
    const got = pool.filter((p) => full.has(p.id)).reduce((x, p) => x + p.amount, 0n);
    assert.ok(got <= best);
    greedyTotal += got;
    optimalTotal += best;
    if (got === best) exact++;
  }
  const ratio = Number((greedyTotal * 10_000n) / optimalTotal) / 100;
  console.log(`greedy clears ${ratio}% of optimal value; exact optimum in ${exact}/${rounds} pools`);
  assert.ok(ratio >= 90);
});

test("partial pass pays what a short debtor can cover", () => {
  // A owes B 10 but has deposited 4: whole bill can't settle, 4 of it can.
  const bill = iou(A, B, 10n);
  const s = selectCycle([bill], bal([[A, 4n]]), NOW);
  assert.ok(s);
  assert.deepEqual(s.ids, [bill.id]);
  assert.deepEqual(s.amounts, [4n]);
  assert.equal(s.partial, 1);
  assert.equal(s.netFunded.get(USDC), 4n);
});

test("credit pass funds a shortfall from a lender with room", () => {
  // A owes B 10, has 6; C lends A up to 5 and has 20 deposited.
  const bill = iou(A, B, 10n);
  const lines = [{ lender: C, borrower: A, token: USDC, available: 5n }];
  const s = selectCycle([bill], bal([[A, 6n], [C, 20n]]), NOW, undefined, lines);
  assert.ok(s);
  assert.deepEqual(s.amounts, [10n]);
  assert.deepEqual(s.draws, [{ borrower: A, lender: C, token: USDC, amount: 4n }]);
  assert.equal(s.partial, 0);
});

test("credit never exceeds the line or the lender's free deposit", () => {
  const bill = iou(A, B, 10n);
  // Line has room for 5 but lender only has 2 free: credit can't cover the 4 gap, so pay 6+0 partially.
  const lines = [{ lender: C, borrower: A, token: USDC, available: 5n }];
  const s = selectCycle([bill], bal([[A, 6n], [C, 2n]]), NOW, undefined, lines);
  assert.ok(s);
  assert.equal(s.draws.length, 0);
  assert.deepEqual(s.amounts, [6n]);
});

test("every selection with partials and credit stays fundable", () => {
  const people = [A, B, C, "0x00000000000000000000000000000000000000dd" as Address];
  let seed = 3;
  const rnd = (m: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % m);
  for (let round = 0; round < 300; round++) {
    const pool: PendingIOU[] = [];
    for (let i = 0; i < 10; i++) {
      const d = rnd(4);
      pool.push(iou(people[d]!, people[(d + 1 + rnd(3)) % 4]!, BigInt(1 + rnd(40))));
    }
    const balances = bal(people.map((p) => [p, BigInt(rnd(30))] as [Address, bigint]));
    const lines = people.flatMap((l, i) => (rnd(3) === 0 ? [{ lender: l, borrower: people[(i + 1) % 4]!, token: USDC, available: BigInt(rnd(20)) }] : []));
    const s = selectCycle(pool, balances, NOW, undefined, lines);
    if (!s) continue;
    // Replay exactly what the contract does: draws first, then nets, then debit checks.
    const ledger = new Map(balances);
    for (const d of s.draws) {
      const lk = balanceKey(d.lender, d.token);
      const bk = balanceKey(d.borrower, d.token);
      assert.ok((ledger.get(lk) ?? 0n) >= d.amount, `round ${round}: lender overdrawn`);
      ledger.set(lk, (ledger.get(lk) ?? 0n) - d.amount);
      ledger.set(bk, (ledger.get(bk) ?? 0n) + d.amount);
    }
    const nets = new Map<string, bigint>();
    s.ids.forEach((id, i) => {
      const p = pool.find((x) => x.id === id)!;
      assert.ok(s.amounts[i]! > 0n && s.amounts[i]! <= p.amount, `round ${round}: bad pay amount`);
      nets.set(balanceKey(p.debtor, p.token), (nets.get(balanceKey(p.debtor, p.token)) ?? 0n) - s.amounts[i]!);
      nets.set(balanceKey(p.creditor, p.token), (nets.get(balanceKey(p.creditor, p.token)) ?? 0n) + s.amounts[i]!);
    });
    for (const [k, net] of nets) assert.ok(net >= 0n || -net <= (ledger.get(k) ?? 0n), `round ${round}: ${k} underfunded`);
  }
});
