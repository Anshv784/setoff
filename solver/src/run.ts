/**
 * One solver pass from the command line.
 *
 *   SETOFF_NETWORK=mainnet SOLVER_PK=0x... npm run solve
 */
import type { Hex } from "viem";
import { solveOnce } from "./solve.ts";

const pk = process.env.SOLVER_PK as Hex | undefined;
if (!pk) throw new Error("SOLVER_PK is required");
const r = await solveOnce(pk);
if (r.settled && r.status !== "success") process.exit(1);
