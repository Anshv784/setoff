import { USDC, tokenSymbol } from "@/lib/config";
import { savedBps, totals, type Snapshot } from "@/lib/data";
import { fmtAmount, fmtPct } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function Stats({ snapshot }: { snapshot: Snapshot }) {
  const t = totals(snapshot);
  const tokens = snapshot.tokens.map((x) => x.toLowerCase()).filter((x) => (t.gross[x] ?? 0n) > 0n);
  const shown = tokens.length ? tokens : [USDC.toLowerCase()];
  const gross = shown.reduce((s, x) => s + (t.gross[x] ?? 0n), 0n);
  const netFunded = shown.reduce((s, x) => s + (t.netFunded[x] ?? 0n), 0n);
  const bps = savedBps(gross, netFunded);
  const fundedPct = gross === 0n ? 0 : Number((netFunded * 10_000n) / gross) / 100;

  return (
    <section aria-labelledby="headline" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Of everything owed and settled through Setoff</p>
        <h1 id="headline" className="text-5xl md:text-7xl font-semibold tracking-tight tabular-nums">
          {fmtPct(bps)} <span className="text-muted-foreground">never moved.</span>
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Debts between the same people cancel out. Each cycle settles every IOU at once and only the net is paid.
        </p>
      </div>

      <div className="flex flex-col gap-2" aria-hidden={gross === 0n}>
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${fmtPct(bps)} of obligations netted out`}>
          <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(fundedPct, gross > 0n ? 1 : 0)}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Liquidity used</span>
          <span>Face value cleared</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
        {shown.map((x) => (
          <Stat key={`g${x}`} label={`Cleared (${tokenSymbol(x)})`} value={fmtAmount(t.gross[x] ?? 0n)} />
        ))}
        {shown.map((x) => (
          <Stat key={`n${x}`} label={`Actually moved (${tokenSymbol(x)})`} value={fmtAmount(t.netFunded[x] ?? 0n)} />
        ))}
        <Stat label="Cycles settled" value={String(snapshot.cycles.length)} />
        <Stat label="IOUs settled" value={String(t.settledIous)} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading totals">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-16 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
