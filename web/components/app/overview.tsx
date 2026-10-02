"use client";

import Link from "next/link";
import type { Address } from "viem";
import { ArrowRight, Clock, FileSignature, Layers, Users, Wallet } from "lucide-react";
import { USDC } from "@/lib/config";
import { savedBps, totals, type IOURow } from "@/lib/data";
import { fmtAgo, fmtAmount, fmtPct } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "./state";

const usdcKey = USDC.toLowerCase();

/** What the open (pending) USDC bills would move if the next cycle ran now. */
function nextCycle(ious: IOURow[]) {
  const open = ious.filter((i) => i.status === "pending" && i.token.toLowerCase() === usdcKey);
  const nets = new Map<string, bigint>();
  for (const i of open) {
    nets.set(i.debtor.toLowerCase(), (nets.get(i.debtor.toLowerCase()) ?? 0n) - i.amount);
    nets.set(i.creditor.toLowerCase(), (nets.get(i.creditor.toLowerCase()) ?? 0n) + i.amount);
  }
  const gross = open.reduce((s, i) => s + i.amount, 0n);
  const net = [...nets.values()].reduce((s, v) => (v < 0n ? s - v : s), 0n);
  return { count: open.length, gross, net, parties: nets.size };
}

function position(ious: IOURow[], me?: Address) {
  if (!me) return undefined;
  const m = me.toLowerCase();
  const open = ious.filter((i) => i.status === "pending" && i.token.toLowerCase() === usdcKey);
  const owe = open.filter((i) => i.debtor.toLowerCase() === m).reduce((s, i) => s + i.amount, 0n);
  const owed = open.filter((i) => i.creditor.toLowerCase() === m).reduce((s, i) => s + i.amount, 0n);
  const settled = ious.filter((i) => i.status === "settled" && (i.debtor.toLowerCase() === m || i.creditor.toLowerCase() === m)).length;
  return { owe, owed, net: owed - owe, settled };
}

export function Overview() {
  const { snapshot, account, connect } = useApp();
  if (!snapshot) return <OverviewSkeleton />;

  const t = totals(snapshot);
  const gross = t.gross[usdcKey] ?? 0n;
  const moved = t.netFunded[usdcKey] ?? 0n;
  const bps = savedBps(gross, moved);
  const next = nextCycle(snapshot.ious);
  const me = position(snapshot.ious, account);
  const participants = new Set(snapshot.ious.flatMap((i) => [i.debtor.toLowerCase(), i.creditor.toLowerCase()])).size;
  const last = snapshot.cycles[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Overview</h1>
          <p className="text-sm text-muted-foreground">Everything owed and settled through Setoff, read live from the contract.</p>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Live · {last?.timestamp ? `last cycle ${fmtAgo(last.timestamp, snapshot.now)}` : "no cycles yet"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hero: the one number that matters */}
        <section aria-labelledby="hero" className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8 lg:col-span-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%)]"
          />
          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 id="hero" className="text-sm text-muted-foreground">
                Never had to move
              </h2>
              <p className="text-6xl font-semibold tracking-tight tabular-nums md:text-7xl">{fmtPct(bps)}</p>
              <p className="max-w-lg text-sm leading-6 text-muted-foreground">
                <span className="font-mono text-foreground">{fmtAmount(gross)} USDC</span> of bills were settled by moving{" "}
                <span className="font-mono text-foreground">{fmtAmount(moved)} USDC</span> across {snapshot.cycles.length}{" "}
                {snapshot.cycles.length === 1 ? "cycle" : "cycles"}.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Bar label="Bills settled" value={gross} max={gross} tone="muted" />
              <Bar label="Actually moved" value={moved} max={gross} tone="primary" />
            </div>
          </div>
        </section>

        {/* What happens next */}
        <section aria-labelledby="next" className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 id="next" className="font-medium">
              Next cycle
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden /> {next.count ? "Bills waiting" : "Nothing queued"}
            </span>
          </div>
          {next.count ? (
            <>
              <dl className="grid grid-cols-2 gap-4">
                <Mini label="Open bills" value={String(next.count)} />
                <Mini label="Parties" value={String(next.parties)} />
                <Mini label="Owed" value={`${fmtAmount(next.gross)}`} unit="USDC" />
                <Mini label="Would move" value={`${fmtAmount(next.net)}`} unit="USDC" accent />
              </dl>
              <p className="text-sm text-muted-foreground">
                If it ran now, {fmtPct(savedBps(next.gross, next.net))} of these bills would cancel out.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No open bills right now. New invoices join the next cycle as soon as they&apos;re posted.</p>
          )}
          <div className="mt-auto flex flex-wrap gap-2">
            <Link href="/app/activity?tab=open" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open bills
            </Link>
            <Link href="/app/network" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              See the network <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        <Tile icon={Layers} label="Cycles settled" value={String(snapshot.cycles.length)} />
        <Tile icon={FileSignature} label="Bills settled" value={String(t.settledIous)} />
        <Tile icon={Users} label="Participants" value={String(participants)} />
        <Tile icon={Wallet} label="Liquidity kept" value={`${fmtAmount(gross - moved)}`} unit="USDC" />
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="recent" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <h2 id="recent" className="font-medium">
              Recent cycles
            </h2>
            <Link href="/app/activity" className="rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              All activity
            </Link>
          </div>
          {snapshot.cycles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No cycles yet. The first one runs as soon as open bills are funded.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {snapshot.cycles.slice(0, 5).map((c) => {
                const g = c.gross[usdcKey] ?? 0n;
                const n = c.netFunded[usdcKey] ?? 0n;
                return (
                  <li key={String(c.cycle)} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 py-3">
                    <span className="font-mono text-sm">#{String(c.cycle)}</span>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {String(c.iouCount)} bills · {c.timestamp ? fmtAgo(c.timestamp, snapshot.now) : "—"}
                        </span>
                        <span className="font-mono tabular-nums">
                          {fmtAmount(n)} of {fmtAmount(g)}
                        </span>
                      </div>
                      <Meter value={n} max={g} label={`Cycle ${c.cycle}: moved ${fmtAmount(n)} of ${fmtAmount(g)} USDC`} />
                    </div>
                    <span className="w-16 text-right font-mono text-sm tabular-nums">{fmtPct(savedBps(g, n))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="you" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 id="you" className="font-medium">
            Your position
          </h2>
          {!me ? (
            <>
              <p className="text-sm text-muted-foreground">Connect a wallet to see what you owe, what you&apos;re owed, and your net for the next cycle.</p>
              <Button className="self-start" onClick={connect}>
                <Wallet aria-hidden /> Connect wallet
              </Button>
            </>
          ) : (
            <>
              <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
                <Row label="You owe" value={`${fmtAmount(me.owe)} USDC`} />
                <Row label="Owed to you" value={`${fmtAmount(me.owed)} USDC`} />
                <Row
                  label="Your net"
                  value={`${me.net > 0n ? "+" : me.net < 0n ? "−" : ""}${fmtAmount(me.net < 0n ? -me.net : me.net)} USDC`}
                  accent={me.net !== 0n}
                />
              </dl>
              <p className="text-xs text-muted-foreground">{me.settled} of your bills settled so far.</p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href="/app/bills" className={buttonVariants({ size: "sm" })}>
                  <FileSignature aria-hidden /> Send an invoice
                </Link>
                <Link href="/app/wallet" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Fund your net
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        Businesses marked &quot;(demo)&quot; are example wallets that keep the network active. They are roles, not real companies.{" "}
        <Link href="/docs/faq#demo" className="underline-offset-4 hover:underline">
          Learn more
        </Link>
      </p>
    </div>
  );
}

const pct = (v: bigint, max: bigint) => (max === 0n ? 0 : Number((v * 10_000n) / max) / 100);

function Bar({ label, value, max, tone }: { label: string; value: bigint; max: bigint; tone: "muted" | "primary" }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_6.5rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" title={`${label}: ${fmtAmount(value)} USDC`}>
        <div
          className={`h-full rounded-full ${tone === "primary" ? "bg-primary" : "bg-muted-foreground/50"}`}
          style={{ width: `${Math.max(value > 0n ? 1.5 : 0, pct(value, max))}%` }}
        />
      </div>
      <span className="text-right font-mono tabular-nums">{fmtAmount(value)}</span>
    </div>
  );
}

function Meter({ value, max, label }: { value: bigint; max: bigint; label: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={label} title={label}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(value > 0n ? 1.5 : 0, pct(value, max))}%` }} />
    </div>
  );
}

function Mini({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-xl tabular-nums ${accent ? "text-primary" : ""}`}>
        {value} {unit && <span className="font-sans text-xs text-muted-foreground">{unit}</span>}
      </dd>
    </div>
  );
}

function Tile({ icon: Icon, label, value, unit }: { icon: typeof Layers; label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center gap-4 bg-card p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-mono text-2xl tabular-nums">
          {value} {unit && <span className="font-sans text-xs text-muted-foreground">{unit}</span>}
        </dd>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-mono tabular-nums ${accent ? "text-primary" : ""}`}>{value}</dd>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading overview">
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-24" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

