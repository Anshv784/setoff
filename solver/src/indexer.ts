/**
 * A tiny log index the app can load in one request instead of every visitor scanning the
 * chain in 10k-block windows. The Worker cron calls `refreshIndex` every couple of minutes;
 * it only fetches blocks after the last run, so each refresh is a few RPC calls.
 */
import { getAbiItem, pad, toEventSelector, type Hex } from "viem";
import { memoAbi } from "./memoAbi.ts";
import { MEMO, network } from "./config.ts";

/** The slice of Cloudflare's KV binding we use. */
export type KVNamespace = { get(key: string): Promise<string | null>; get<T>(key: string, type: "json"): Promise<T | null>; put(key: string, value: string): Promise<void> };

type RawLog = Record<string, unknown> & { topics: Hex[]; blockNumber: Hex };
export type LogIndex = { to: string; setoff: RawLog[]; memo: RawLog[]; registry: { o: Hex; id: Hex; b: Hex }[] };

const RANGE = 10_000n;
const MAX_WINDOWS_PER_RUN = 2;
const REGISTERED = toEventSelector("Registered(uint256,string,address)");
const MEMO_TOPIC = toEventSelector(getAbiItem({ abi: memoAbi, name: "Memo" }));

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = (await (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()) as { result?: T; error?: { message: string } };
    if (r.result !== undefined) return r.result;
    if (attempt >= 4) throw new Error(`${method}: ${r.error?.message ?? "no result"}`);
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
}

export async function refreshIndex(kv: KVNamespace, rpcUrl?: string): Promise<LogIndex> {
  const net = { ...network() };
  if (rpcUrl) net.rpc = rpcUrl;
  const prev = await kv.get<LogIndex>("index:v1", "json");
  const idx: LogIndex = prev ?? { to: (net.deployBlock - 1n).toString(), setoff: [], memo: [], registry: [] };
  const head = BigInt(await rpc<Hex>(net.rpc, "eth_blockNumber", []));
  let from = BigInt(idx.to) + 1n;
  for (let w = 0; w < MAX_WINDOWS_PER_RUN && from <= head; w++) {
    const to = from + RANGE - 1n > head ? head : from + RANGE - 1n;
    const range = { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` };
    // One call at a time with a pause: the public RPC rate-limits shared Cloudflare IPs.
    const pause = () => new Promise((res) => setTimeout(res, 400));
    const setoff = await rpc<RawLog[]>(net.rpc, "eth_getLogs", [{ ...range, address: net.setoff }]);
    await pause();
    const memo = await rpc<RawLog[]>(net.rpc, "eth_getLogs", [{ ...range, address: MEMO, topics: [MEMO_TOPIC, null, pad(net.setoff)] }]);
    await pause();
    const reg = await rpc<RawLog[]>(net.rpc, "eth_getLogs", [{ ...range, address: net.identityRegistry, topics: [REGISTERED] }]);
    idx.setoff.push(...setoff);
    idx.memo.push(...memo);
    for (const l of reg) idx.registry.push({ o: `0x${l.topics[2]!.slice(26)}` as Hex, id: l.topics[1]!, b: l.blockNumber });
    idx.to = to.toString();
    from = to + 1n;
    await kv.put("index:v1", JSON.stringify(idx)); // keep progress even if a later window fails
  }
  return idx;
}
