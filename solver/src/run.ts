/**
 * One solver pass: read the pool, pick a fundable cycle, settle it through Arc's
 * Memo contract so the cycle summary is attached to the transaction onchain.
 *
 *   SETOFF_NETWORK=mainnet SOLVER_PK=0x... npm run solve
 */
import { createWalletClient, encodeFunctionData, formatUnits, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { memoAbi } from "./memoAbi.ts";
import { setoffAbi } from "./setoffAbi.ts";
import { MEMO, network, USDC } from "./config.ts";
import { loadBalances, loadCreditLines, loadFxPrefs, loadPool, publicClient } from "./chain.ts";
import { referenceRate, selectWithFx } from "./fx.ts";

const net = network();
const pk = process.env.SOLVER_PK as Hex | undefined;
if (!pk) throw new Error("SOLVER_PK is required");
const account = privateKeyToAccount(pk);
const client = publicClient(net);
const wallet = createWalletClient({ account, chain: net.chain, transport: http(net.rpc) });

const symbol = (token: string) => (token.toLowerCase() === USDC.toLowerCase() ? "USDC" : "EURC");
const fmt = (token: string, v: bigint) => `${formatUnits(v, 6)} ${symbol(token)}`;

const pool = await loadPool(client, net);
console.log(`pool: ${pool.length} pending IOUs`);
if (pool.length === 0) process.exit(0);

const lines = await loadCreditLines(client, net);
const balances = await loadBalances(client, net, pool, lines.map((l) => l.lender));
const { timestamp } = await client.getBlock();
const [prefs, rate] = await Promise.all([loadFxPrefs(client, net), referenceRate()]);
const cycle = selectWithFx(pool, balances, timestamp, lines, prefs, USDC, net.eurc, rate);
if (!cycle) {
  console.log("no fundable cycle: every net debtor is short");
  process.exit(0);
}

const next = (await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "cycleCount" })) + 1n;
const summary = [...cycle.gross.entries()]
  .map(([t, g]) => `${fmt(t, g)} cleared with ${fmt(t, cycle.netFunded.get(t) ?? 0n)}`)
  .join("; ");
const extras = [
  cycle.partial ? `${cycle.partial} paid in part` : "",
  cycle.draws.length ? `${cycle.draws.length} credit draw${cycle.draws.length > 1 ? "s" : ""}` : "",
  cycle.fx.length ? `${cycle.fx.length / 2} USDC/EURC swap${cycle.fx.length > 2 ? "s" : ""} at ${formatUnits(rate ?? 0n, 6)}` : "",
].filter(Boolean);
const memoText = `Setoff cycle ${next}: ${cycle.ids.length} IOUs, ${summary}${extras.length ? ` (${extras.join(", ")})` : ""}`;
console.log(memoText);

const settleData = encodeFunctionData({
  abi: setoffAbi,
  functionName: "settle",
  args: [cycle.ids, cycle.amounts, cycle.parties, cycle.draws, cycle.fx],
});
const memoArgs = [net.setoff, settleData, keccak256(toHex(`setoff:cycle:${next}`)), toHex(memoText)] as const;

// Simulate first: a deposit withdrawn after we read balances would revert onchain.
await client.simulateContract({ account, address: MEMO, abi: memoAbi, functionName: "memo", args: memoArgs });
const hash = await wallet.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo", args: memoArgs });
const receipt = await client.waitForTransactionReceipt({ hash });
console.log(`${receipt.status}: ${net.explorer}/tx/${hash} (gas ${receipt.gasUsed})`);
if (receipt.status !== "success") process.exit(1);
