import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { matchFx, selectWithFx, type FxPref } from "./fx.ts";
import { balanceKey, type PendingIOU } from "./select.ts";

const U = "0x3600000000000000000000000000000000000000" as Address;
const E = "0x89b50855aa3be2f677cd6303cec089b5f319d72a" as Address;
const A = "0x00000000000000000000000000000000000000a1" as Address;
const B = "0x00000000000000000000000000000000000000b2" as Address;
const iou = (n: number, debtor: Address, creditor: Address, token: Address, amount: bigint): PendingIOU => ({
  id: `0x${n.toString(16).padStart(64, "0")}` as Hex, debtor, creditor, token, amount, deadline: 10n ** 12n,
});
// A owes B 10.70 USDC; B owes A 10 EURC.
const pool = [iou(1, A, B, U, 10_700_000n), iou(2, B, A, E, 10_000_000n)];
const prefs = (aMin: bigint, bMin: bigint): FxPref[] => [
  { account: A, sell: E, buy: U, minRate: aMin },
  { account: B, sell: U, buy: E, minRate: bMin },
];

test("opted-in opposite leftovers cancel with no deposits", () => {
  const sel = selectWithFx(pool, new Map(), 0n, [], prefs(1_060_000n, 930_000n), U, E, 1_070_000n);
  assert.equal(sel?.ids.length, 2);
  assert.deepEqual(sel?.fx.map((c) => [c.sellAmount, c.buyAmount]), [[10_000_000n, 10_700_000n], [10_700_000n, 10_000_000n]]);
  assert.deepEqual([...sel!.netFunded.values()], [0n, 0n]);
});

test("a floor above the market rate keeps that party in its own currency", () => {
  assert.equal(selectWithFx(pool, new Map(), 0n, [], prefs(1_080_000n, 930_000n), U, E, 1_070_000n), null);
});

test("without opt-ins nothing converts", () => {
  const bal = new Map([[balanceKey(A, U), 10_700_000n], [balanceKey(B, E), 10_000_000n]]);
  assert.deepEqual(selectWithFx(pool, bal, 0n, [], [], U, E, 1_070_000n)?.fx, []);
});

test("conversions balance per token and never exceed a leftover", () => {
  const nets = new Map([[balanceKey(A, E), 5_000_000n], [balanceKey(A, U), -20_000_000n], [balanceKey(B, E), -9_000_000n], [balanceKey(B, U), 30_000_000n]]);
  const fx = matchFx(nets, prefs(1n, 1n), U, E, 1_100_000n);
  assert.equal(fx[0]!.sellAmount, 5_000_000n); // all of A's EURC leftover, no more
  for (const t of [U, E]) {
    const sold = fx.filter((c) => c.sell === t).reduce((s, c) => s + c.sellAmount, 0n);
    const bought = fx.filter((c) => c.buy === t).reduce((s, c) => s + c.buyAmount, 0n);
    assert.equal(sold, bought);
  }
});
