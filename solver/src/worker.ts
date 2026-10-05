/**
 * Cloudflare Worker: runs one solver pass on a cron schedule (see wrangler.toml).
 * Secrets: SOLVER_PK. Vars: SETOFF_NETWORK.
 */
import type { Hex } from "viem";
import { solveOnce } from "./solve.ts";
import { refreshIndex, type KVNamespace } from "./indexer.ts";

type Env = { SOLVER_PK: Hex; SETOFF_NETWORK?: string; SETOFF_INDEX: KVNamespace; INDEX_RPC?: string };

export default {
  async scheduled(event: { scheduledTime: number }, env: Env) {
    // Every 2 minutes: extend the log index. Every 30 minutes: also run the solver.
    await refreshIndex(env.SETOFF_INDEX, env.INDEX_RPC).catch((e) => console.log(`index: ${e}`));
    if (new Date(event.scheduledTime).getUTCMinutes() % 30 < 2) {
      const r = await solveOnce(env.SOLVER_PK);
      if (!r.settled) console.log(`no cycle: ${r.reason}`);
    }
  },
  // GET / shows the solver is alive (no secrets, no writes).
  async fetch(req: Request, env: Env) {
    if (new URL(req.url).pathname === "/index") {
      const body = (await env.SETOFF_INDEX.get("index:v1")) ?? "null";
      return new Response(body, { headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "public, max-age=30" } });
    }
    return new Response("Setoff solver: runs every 30 minutes on Arc mainnet. /index serves the log index.\n");
  },
};
