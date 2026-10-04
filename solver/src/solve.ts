/**
 * One solver pass: read the pool, pick a fundable cycle, settle it through Arc's Memo
 * contract so the cycle summary is attached onchain. Used by the CLI and the Worker cron.
 */
import { createWalletClient, encodeFunctionData, formatUnits, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { memoAbi } from "./memoAbi.ts";
import { setoffAbi } from "./setoffAbi.ts";
import { MEMO, network, USDC } from "./config.ts";
import { loadBalances, loadCreditLines, loadFxPrefs, loadPool, publicClient } from "./chain.ts";
import { referenceRate, selectWithFx } from "./fx.ts";

export type SolveResult = { settled: false; reason: string } | { settled: true; memo: string; tx: Hex; status: string; gas: bigint };

export async function solveOnce(pk: Hex, log: (s: string) => void = console.log): Promise<SolveResult> {
  const net = network();
  const account = privateKeyToAccount(pk);
  const client = publicClient(net);
  const wallet = createWalletClient({ account, chain: net.chain, transport: http(net.rpc) });
  const symbol = (token: string) => (token.toLowerCase() === USDC.toLowerCase() ? "USDC" : "EURC");
  const fmt = (token: string, v: bigint) => `${formatUnits(v, 6)} ${symbol(token)}`;

  const pool = await loadPool(client, net);
  log(`pool: ${pool.length} pending IOUs`);
  if (pool.length === 0) return { settled: false, reason: "empty pool" };

  const lines = await loadCreditLines(client, net);
  const balances = await loadBalances(client, net, pool, lines.map((l) => l.lender));
  const { timestamp } = await client.getBlock();
  const [prefs, rate] = await Promise.all([loadFxPrefs(client, net), referenceRate()]);
  const cycle = selectWithFx(pool, balances, timestamp, lines, prefs, USDC, net.eurc, rate);
  if (!cycle) {
    log("no fundable cycle: every net debtor is short");
    return { settled: false, reason: "no fundable cycle" };
  }

  const next = (await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "cycleCount" })) + 1n;
  const summary = [...cycle.gross.entries()].map(([t, g]) => `${fmt(t, g)} cleared with ${fmt(t, cycle.netFunded.get(t) ?? 0n)}`).join("; ");
  const extras = [
    cycle.partial ? `${cycle.partial} paid in part` : "",
    cycle.draws.length ? `${cycle.draws.length} credit draw${cycle.draws.length > 1 ? "s" : ""}` : "",
    cycle.fx.length ? `${cycle.fx.length / 2} USDC/EURC swap${cycle.fx.length > 2 ? "s" : ""} at ${formatUnits(rate ?? 0n, 6)}` : "",
  ].filter(Boolean);
  const memo = `Setoff cycle ${next}: ${cycle.ids.length} IOUs, ${summary}${extras.length ? ` (${extras.join(", ")})` : ""}`;
  log(memo);

  const settleData = encodeFunctionData({ abi: setoffAbi, functionName: "settle", args: [cycle.ids, cycle.amounts, cycle.parties, cycle.draws, cycle.fx] });
  const memoArgs = [net.setoff, settleData, keccak256(toHex(`setoff:cycle:${next}`)), toHex(memo)] as const;

  // Simulate first: a deposit withdrawn after we read balances would revert onchain.
  await client.simulateContract({ account, address: MEMO, abi: memoAbi, functionName: "memo", args: memoArgs });
  const tx = await wallet.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo", args: memoArgs });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  log(`${receipt.status}: ${net.explorer}/tx/${tx} (gas ${receipt.gasUsed})`);
  return { settled: true, memo, tx, status: receipt.status, gas: receipt.gasUsed };
}
