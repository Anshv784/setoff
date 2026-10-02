import { formatUnits } from "viem";
import { tokenSymbol } from "./config";

const amountFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtAmount = (v: bigint) => amountFmt.format(Number(formatUnits(v, 6)));
export const fmtToken = (v: bigint, token: string) => `${fmtAmount(v)} ${tokenSymbol(token)}`;
export const fmtPct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const rel = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function fmtAgo(ts: bigint, now: bigint) {
  const s = Number(now - ts);
  if (s < 60) return "just now";
  if (s < 3600) return rel.format(-Math.floor(s / 60), "minute");
  if (s < 86_400) return rel.format(-Math.floor(s / 3600), "hour");
  return rel.format(-Math.floor(s / 86_400), "day");
}

export const fmtDate = (ts: bigint) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(ts) * 1000));
