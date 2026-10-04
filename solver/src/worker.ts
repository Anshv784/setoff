/**
 * Cloudflare Worker: runs one solver pass on a cron schedule (see wrangler.toml).
 * Secrets: SOLVER_PK. Vars: SETOFF_NETWORK.
 */
import type { Hex } from "viem";
import { solveOnce } from "./solve.ts";

type Env = { SOLVER_PK: Hex; SETOFF_NETWORK?: string };

export default {
  async scheduled(_event: unknown, env: Env) {
    const r = await solveOnce(env.SOLVER_PK);
    if (!r.settled) console.log(`no cycle: ${r.reason}`);
  },
  // GET / shows the solver is alive (no secrets, no writes).
  async fetch() {
    return new Response("Setoff solver: runs every 30 minutes on Arc mainnet.\n");
  },
};
