import { createPublicClient, getAbiItem, http, type Address, type Hex } from "viem";
import type { FxPref } from "./fx.ts";
import { setoffAbi } from "./setoffAbi.ts";
import { LOG_RANGE, type Network } from "./config.ts";
import { balanceKey, type Balances, type CreditLine, type PendingIOU } from "./select.ts";

const STATUS_PENDING = 1;

type Client = ReturnType<typeof publicClient>;

export const publicClient = (net: Network) =>
  createPublicClient({ chain: net.chain, transport: http(net.rpc, { retryCount: 4, batch: true }) });

/** Every IOU id ever submitted, read in 10k-block windows (Arc's getLogs cap). */
async function submittedIds(client: Client, net: Network): Promise<Hex[]> {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const windows: [bigint, bigint][] = [];
  for (let from = net.deployBlock; from <= head; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n;
    windows.push([from, to > head ? head : to]);
  }
  const event = getAbiItem({ abi: setoffAbi, name: "IOUSubmitted" });
  const ids: Hex[] = [];
  for (let i = 0; i < windows.length; i += 6) {
    const batch = await Promise.all(
      windows.slice(i, i + 6).map(([fromBlock, toBlock]) =>
        client.getLogs({ address: net.setoff, event, fromBlock, toBlock }),
      ),
    );
    for (const logs of batch) for (const log of logs) if (log.args.id) ids.push(log.args.id);
  }
  return ids;
}

/** The live pool: submitted IOUs whose on-chain status is still Pending. */
export async function loadPool(client: Client, net: Network): Promise<PendingIOU[]> {
  const ids = await submittedIds(client, net);
  if (ids.length === 0) return [];
  const records = await client.multicall({
    contracts: ids.map((id) => ({ address: net.setoff, abi: setoffAbi, functionName: "getIOU", args: [id] }) as const),
    allowFailure: false,
  });
  const pool: PendingIOU[] = [];
  records.forEach(([iou, status, , paid], i) => {
    if (status !== STATUS_PENDING) return;
    pool.push({
      id: ids[i]!,
      debtor: iou.debtor,
      creditor: iou.creditor,
      token: iou.token,
      // Only what's still owed: a partly paid IOU contributes its remainder.
      amount: iou.amount - paid,
      deadline: iou.deadline,
    });
  });
  return pool;
}

/** Deposits of every debtor in the pool (and any extra accounts, e.g. lenders), per token. */
export async function loadBalances(client: Client, net: Network, pool: PendingIOU[], extra: Address[] = []): Promise<Balances> {
  const tokens = (await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "tokens" })) as Address[];
  const debtors = [...new Set([...pool.map((p) => p.debtor), ...extra].map((a) => a.toLowerCase() as Address))];
  const pairs = debtors.flatMap((d) => tokens.map((t) => [d, t] as const));
  const values = await client.multicall({
    contracts: pairs.map(([d, t]) => ({ address: net.setoff, abi: setoffAbi, functionName: "balanceOf", args: [d, t] }) as const),
    allowFailure: false,
  });
  return new Map(pairs.map(([d, t], i) => [balanceKey(d, t), values[i]!]));
}

/** Credit lines still available to draw, discovered from CreditLineSet events. */
export async function loadCreditLines(client: Client, net: Network): Promise<CreditLine[]> {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const event = getAbiItem({ abi: setoffAbi, name: "CreditLineSet" });
  const seen = new Map<string, { lender: Address; borrower: Address; token: Address }>();
  for (let from = net.deployBlock; from <= head; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n > head ? head : from + LOG_RANGE - 1n;
    const logs = await client.getLogs({ address: net.setoff, event, fromBlock: from, toBlock: to });
    for (const l of logs) {
      const { lender, borrower, token } = l.args;
      if (lender && borrower && token) seen.set(`${lender}:${borrower}:${token}`.toLowerCase(), { lender, borrower, token });
    }
  }
  if (seen.size === 0) return [];
  const lines = [...seen.values()];
  const state = await client.multicall({
    contracts: lines.map((l) => ({ address: net.setoff, abi: setoffAbi, functionName: "creditLine", args: [l.lender, l.borrower, l.token] }) as const),
    allowFailure: false,
  });
  return lines
    .map((l, i) => {
      const [limit, used] = state[i]!;
      return { ...l, available: limit > used ? limit - used : 0n };
    })
    .filter((l) => l.available > 0n);
}

/** Current FX opt-ins, discovered from FxPreferenceSet events (0 = opted out, dropped). */
export async function loadFxPrefs(client: Client, net: Network): Promise<FxPref[]> {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const event = getAbiItem({ abi: setoffAbi, name: "FxPreferenceSet" });
  const seen = new Map<string, FxPref>();
  for (let from = net.deployBlock; from <= head; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n > head ? head : from + LOG_RANGE - 1n;
    for (const l of await client.getLogs({ address: net.setoff, event, fromBlock: from, toBlock: to })) {
      const { account, sell, buy, minRate } = l.args;
      if (account && sell && buy && minRate !== undefined) seen.set(`${account}:${sell}:${buy}`.toLowerCase(), { account, sell, buy, minRate: BigInt(minRate) });
    }
  }
  return [...seen.values()].filter((p) => p.minRate > 0n);
}
