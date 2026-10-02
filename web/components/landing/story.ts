/**
 * The hero's story, as real data: 18 bills between 12 financial centres, netted the
 * same way Setoff does it. The globe draws the bills, then the net transfers they
 * reduce to; the counters beside it are computed from the same numbers.
 */

export const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: "New York", lat: 40.7, lon: -74 },
  { name: "London", lat: 51.5, lon: -0.1 },
  { name: "Frankfurt", lat: 50.1, lon: 8.7 },
  { name: "Lagos", lat: 6.5, lon: 3.4 },
  { name: "Dubai", lat: 25.2, lon: 55.3 },
  { name: "Mumbai", lat: 19.1, lon: 72.9 },
  { name: "Singapore", lat: 1.35, lon: 103.8 },
  { name: "Tokyo", lat: 35.7, lon: 139.7 },
  { name: "Sydney", lat: -33.9, lon: 151.2 },
  { name: "São Paulo", lat: -23.5, lon: -46.6 },
  { name: "Mexico City", lat: 19.4, lon: -99.1 },
  { name: "Nairobi", lat: -1.3, lon: 36.8 },
];

/** [debtor, creditor, amount in USDC] */
export const BILLS: [number, number, number][] = [
  [0, 1, 12], [1, 2, 11], [2, 0, 12],
  [4, 5, 9], [5, 6, 9], [6, 4, 8],
  [7, 8, 7], [8, 6, 7], [6, 7, 7],
  [9, 10, 8], [10, 0, 8], [0, 9, 8],
  [3, 11, 6], [11, 4, 6], [4, 3, 5],
  [1, 3, 4], [3, 1, 4], [5, 7, 3],
];

function settle() {
  const nets = CITIES.map(() => 0);
  for (const [d, c, a] of BILLS) {
    nets[d]! -= a;
    nets[c]! += a;
  }
  const debtors = nets.flatMap((v, i) => (v < 0 ? [[i, -v]] : []));
  const creditors = nets.flatMap((v, i) => (v > 0 ? [[i, v]] : []));
  const flows: [number, number, number][] = [];
  for (let i = 0, j = 0; i < debtors.length && j < creditors.length; ) {
    const a = Math.min(debtors[i]![1]!, creditors[j]![1]!);
    flows.push([debtors[i]![0]!, creditors[j]![0]!, a]);
    debtors[i]![1]! -= a;
    creditors[j]![1]! -= a;
    if (!debtors[i]![1]) i++;
    if (!creditors[j]![1]) j++;
  }
  return { nets, flows };
}

export const { nets: NETS, flows: FLOWS } = settle();
export const GROSS = BILLS.reduce((s, b) => s + b[2], 0);
export const NET = FLOWS.reduce((s, f) => s + f[2], 0);

/** 0 → 1 as the visitor scrolls through the pinned hero. Written by the hero, read every frame by the globe. */
export const heroProgress = { current: 0 };

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
