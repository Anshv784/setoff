"use client";

import { useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useReducedMotion } from "motion/react";
import { labelOf, tokenSymbol } from "@/lib/config";
import type { IOURow, Snapshot } from "@/lib/data";
import { fmtAgo, fmtAmount, shortAddr } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

type View = "before" | "after";
type Scope = "all" | "mine";

const W = 720;
const H = 560;
const CX = W / 2;
const CY = H / 2;
const RING = 210;
/** Above this many parties, the quietest are grouped into one "others" node. */
const MAX_NODES = 12;
const OTHERS = "others" as Address;

export function NetworkView({ snapshot, account }: { snapshot: Snapshot; account?: Address }) {
  const reduce = useReducedMotion();
  const cycleIds = snapshot.cycles.map((c) => String(c.cycle));
  const hasOpen = snapshot.ious.some((i) => i.status === "pending");
  const options = [...(hasOpen ? ["open"] : []), ...cycleIds];
  const [picked, setPicked] = useState<string>();
  const [view, setView] = useState<View>("before");
  const [scope, setScope] = useState<Scope>("all");
  const source = picked && options.includes(picked) ? picked : options[0];
  const me = account?.toLowerCase();

  // React Compiler memoizes these; no manual useMemo needed.
  const rows =
    source === "open"
      ? snapshot.ious.filter((i) => i.status === "pending")
      : snapshot.ious.filter((i) => i.status === "settled" && String(i.cycle) === source);
  const ious = scope === "mine" && me ? rows.filter((i) => i.debtor.toLowerCase() === me || i.creditor.toLowerCase() === me) : rows;
  const graph = build(ious, me);

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        label="Diagram view"
        value={view}
        onChange={setView}
        options={[
          { value: "before", label: "Before netting" },
          { value: "after", label: "After netting" },
        ]}
      />
      <Segmented
        label="Whose bills"
        value={scope}
        onChange={setScope}
        options={[
          { value: "all", label: "Whole network" },
          { value: "mine", label: "Just me", disabled: !account },
        ]}
      />
      {options.length > 0 && (
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden md:inline">Showing</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Choose which cycle to show"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {source === "open" ? (
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              ) : (
                <span className="font-mono text-xs text-muted-foreground">#</span>
              )}
              {sourceLabel(source ?? "open")}
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-64 p-1">
              {options.map((o) => {
                const c = snapshot.cycles.find((x) => String(x.cycle) === o);
                const bills = o === "open" ? snapshot.ious.filter((i) => i.status === "pending").length : Number(c?.iouCount ?? 0);
                return (
                  <DropdownMenuItem key={o} className="h-auto items-start gap-3 px-2.5 py-2" onClick={() => setPicked(o)}>
                    <Check className={`mt-0.5 size-4 ${o === source ? "text-primary" : "invisible"}`} aria-hidden />
                    <span className="flex flex-col">
                      <span className="text-sm">{sourceLabel(o)}</span>
                      <span className="text-xs text-muted-foreground">
                        {bills} bills · {o === "open" ? "not settled yet" : c?.timestamp ? fmtAgo(c.timestamp, snapshot.now) : "settled"}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );

  if (!graph) {
    return (
      <div className="flex flex-col gap-4">
        {controls}
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-10">
          <p className="text-base font-medium">{scope === "mine" ? "You're not in any bills here yet" : "Nothing to draw yet"}</p>
          <p className="text-sm text-muted-foreground">
            {scope === "mine"
              ? "Send an invoice or record what you owe, and you'll appear in the next cycle's network."
              : "The network appears once there are bills in the pool or a settled cycle."}
          </p>
          {scope === "mine" && (
            <Link href="/app/bills" className={buttonVariants()}>
              Send an invoice
            </Link>
          )}
        </div>
      </div>
    );
  }

  const saved = graph.gross === 0n ? 0 : Number(((graph.gross - graph.net) * 1000n) / graph.gross) / 10;
  const after = view === "after";

  return (
    <div className="flex flex-col gap-4">
      {controls}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(70%_60%_at_50%_45%,color-mix(in_oklch,var(--primary)_10%,var(--card)),var(--background))]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={
              after
                ? `${graph.flows.length} net transfers through Setoff, ${fmtAmount(graph.net)} ${graph.symbol} moved`
                : `${graph.edges.length} bills between ${graph.nodes.length} parties, ${fmtAmount(graph.gross)} ${graph.symbol} owed`
            }
          >
            <defs>
              <radialGradient id="hub-glow">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </radialGradient>
              <marker id="tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,1 L9,5 L0,9 z" fill="var(--muted-foreground)" />
              </marker>
              <marker id="tip-strong" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,1 L9,5 L0,9 z" fill="var(--primary)" />
              </marker>
            </defs>

            {/* Faint orbit the parties sit on. */}
            <circle cx={CX} cy={CY} r={RING} fill="none" stroke="var(--border)" strokeDasharray="2 6" />

            <g style={{ opacity: after ? 0 : 1, transition: "opacity 400ms ease" }}>
              {graph.edges.map((e, i) => {
                const d = curve(graph.pos(e.from), graph.pos(e.to), graph.radius(e.from), graph.radius(e.to) + 6, 0.22);
                return (
                  <g key={i}>
                    <path
                      id={`e${i}`}
                      d={d}
                      fill="none"
                      stroke="var(--muted-foreground)"
                      strokeOpacity={0.45}
                      strokeWidth={1 + 3 * share(e.amount, graph.maxEdge)}
                      markerEnd="url(#tip)"
                    >
                      <title>{`${nameOf(e.from)} owes ${nameOf(e.to)} ${fmtAmount(e.amount)} ${graph.symbol}`}</title>
                    </path>
                    {!reduce && !after && (
                      <circle r={2.2} fill="var(--foreground)" opacity={0.7}>
                        <animateMotion dur={`${3 + (i % 4) * 0.6}s`} repeatCount="indefinite" begin={`${(i % 7) * 0.35}s`}>
                          <mpath href={`#e${i}`} />
                        </animateMotion>
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>

            <g style={{ opacity: after ? 1 : 0, transition: "opacity 400ms ease" }}>
              <circle cx={CX} cy={CY} r={90} fill="url(#hub-glow)" />
              {graph.flows.map((f, i) => {
                const p = graph.pos(f.party);
                const inward = f.direction === "in";
                const d = inward ? line(p, { x: CX, y: CY }, graph.radius(f.party) + 2, 40) : line({ x: CX, y: CY }, p, 38, graph.radius(f.party) + 6);
                const mid = { x: (p.x + CX) / 2, y: (p.y + CY) / 2 };
                return (
                  <g key={i}>
                    <path id={`f${i}`} d={d} fill="none" stroke="var(--primary)" strokeWidth={1.5 + 4 * share(f.amount, graph.maxFlow)} markerEnd="url(#tip-strong)" strokeLinecap="round" />
                    {!reduce && after && (
                      <circle r={3} fill="var(--primary-foreground)">
                        <animateMotion dur="2.2s" repeatCount="indefinite" begin={`${i * 0.25}s`}>
                          <mpath href={`#f${i}`} />
                        </animateMotion>
                      </circle>
                    )}
                    <g transform={`translate(${mid.x} ${mid.y})`}>
                      <rect x={-30} y={-11} width={60} height={22} rx={11} fill="var(--background)" stroke="var(--primary)" strokeOpacity={0.5} />
                      <text textAnchor="middle" y={4} fontSize={11} className="fill-foreground font-mono">
                        {fmtAmount(f.amount)}
                      </text>
                    </g>
                  </g>
                );
              })}
              <circle cx={CX} cy={CY} r={36} fill="var(--card)" stroke="var(--primary)" strokeWidth={1.5} />
              <text x={CX} y={CY - 2} textAnchor="middle" fontSize={13} fontWeight={600} className="fill-foreground">
                Setoff
              </text>
              <text x={CX} y={CY + 13} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
                one cycle
              </text>
            </g>

            {graph.nodes.map((n) => {
              const { x, y } = graph.pos(n);
              const r = graph.radius(n);
              const net = graph.nets.get(n) ?? 0n;
              const isMe = n === me;
              const right = x >= CX;
              const lx = x + (right ? r + 10 : -(r + 10));
              return (
                <g key={n}>
                  {isMe && <circle cx={x} cy={y} r={r + 5} fill="none" stroke="var(--primary)" strokeWidth={2} />}
                  <circle cx={x} cy={y} r={r} fill="var(--card)" stroke={after && net !== 0n ? "var(--primary)" : "var(--border)"} strokeWidth={1.5} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-foreground">
                    {initials(n)}
                  </text>
                  <text x={lx} y={y - 3} textAnchor={right ? "start" : "end"} fontSize={12.5} className="fill-foreground">
                    {isMe ? "You" : nameOf(n)}
                  </text>
                  <text x={lx} y={y + 13} textAnchor={right ? "start" : "end"} fontSize={11} className="fill-muted-foreground font-mono">
                    {after
                      ? net === 0n
                        ? "even — pays nothing"
                        : `${net > 0n ? "receives" : "pays"} ${fmtAmount(net > 0n ? net : -net)}`
                      : `${graph.billsOf.get(n) ?? 0} bills`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            <Stat label={after ? "Transfers" : "Bills"} value={String(after ? graph.flows.length : graph.edges.length)} accent={after} />
            <Stat label={`${graph.symbol} ${after ? "moved" : "owed"}`} value={fmtAmount(after ? graph.net : graph.gross)} accent={after} />
            <Stat label="Parties" value={String(graph.partyCount)} />
            <Stat label="Never moved" value={`${saved}%`} />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-medium">{after ? "Net positions" : "Most active"}</p>
            <ul className="flex flex-col gap-2.5">
              {(after ? graph.ranked : graph.byVolume).slice(0, 6).map(([n, net]) => {
                const v = after ? (net < 0n ? -net : net) : (graph.volume.get(n) ?? 0n);
                const max = after ? graph.maxNet : graph.maxVolume;
                return (
                  <li key={n} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{n === me ? "You" : nameOf(n)}</span>
                      <span className={`font-mono text-xs tabular-nums ${after && net > 0n ? "text-primary" : "text-muted-foreground"}`}>
                        {after ? (net === 0n ? "even" : `${net > 0n ? "+" : "−"}${fmtAmount(v)}`) : fmtAmount(v)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${after && net > 0n ? "bg-primary" : "bg-muted-foreground/60"}`}
                        style={{ width: `${max === 0n ? 0 : Math.max(2, share(v, max) * 100)}%`, transition: "width 400ms ease" }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {graph.hidden > 0 && <p className="text-xs text-muted-foreground">{graph.hidden} quieter parties grouped as &quot;others&quot;.</p>}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {after
              ? "Each party only pays or receives its net. Everyone in this cycle is settled in one transaction."
              : "Each arrow is a bill: the debtor owes the creditor. Thicker means larger."}
            {graph.otherTokens > 0 && ` ${graph.otherTokens} bills in other currencies aren't shown; they net separately.`}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          aria-pressed={value === o.value}
          title={o.disabled ? "Connect a wallet to see your bills" : undefined}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-2xl tabular-nums ${accent ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}

const sourceLabel = (o: string) => (o === "open" ? "Next cycle" : `Cycle #${o}`);

// ---------------------------------------------------------------------- data

function nameOf(a: Address) {
  if (a === OTHERS) return "Others";
  const l = labelOf(a);
  return l ? l.name.replace(/ \(demo\)$/, "") : shortAddr(a);
}

function initials(a: Address) {
  if (a === OTHERS) return "+";
  const l = labelOf(a);
  if (!l) return a.slice(2, 4).toUpperCase();
  const words = l.name.replace(/ \(demo\)$/, "").split(/\s+/);
  // "Design studio" → DS, but "Cafe" → CA so single words don't collide.
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join("") : words[0]!.slice(0, 2)).toUpperCase();
}

const share = (v: bigint, max: bigint) => (max === 0n ? 0 : Number((v * 1000n) / max) / 1000);

type Point = { x: number; y: number };

function line(a: Point, b: Point, padA: number, padB: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return `M${a.x + (dx / len) * padA},${a.y + (dy / len) * padA} L${b.x - (dx / len) * padB},${b.y - (dy / len) * padB}`;
}

function curve(a: Point, b: Point, padA: number, padB: number, bend: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Bend sideways so A→B and B→A separate instead of overlapping.
  const mx = (a.x + b.x) / 2 - uy * len * bend;
  const my = (a.y + b.y) / 2 + ux * len * bend;
  const s = { x: a.x + ux * padA, y: a.y + uy * padA };
  const e = { x: b.x - ux * padB, y: b.y - uy * padB };
  return `M${s.x},${s.y} Q${mx},${my} ${e.x},${e.y}`;
}

function build(ious: IOURow[], me?: string) {
  if (ious.length === 0) return undefined;
  // Draw the currency with the most face value; currencies never net against each other.
  const byToken = new Map<string, bigint>();
  for (const i of ious) byToken.set(i.token.toLowerCase(), (byToken.get(i.token.toLowerCase()) ?? 0n) + i.amount);
  const token = [...byToken].sort((a, b) => (b[1] > a[1] ? 1 : -1))[0]![0];
  const rows = ious.filter((i) => i.token.toLowerCase() === token);
  const key = (a: Address) => a.toLowerCase() as Address;

  // Keep the most active parties (and always the viewer); fold the rest into "others".
  const volume = new Map<Address, bigint>();
  for (const i of rows) {
    volume.set(key(i.debtor), (volume.get(key(i.debtor)) ?? 0n) + i.amount);
    volume.set(key(i.creditor), (volume.get(key(i.creditor)) ?? 0n) + i.amount);
  }
  const byVolume = [...volume.keys()].sort((a, b) => (volume.get(b)! > volume.get(a)! ? 1 : -1));
  const keep = new Set(byVolume.length <= MAX_NODES ? byVolume : byVolume.slice(0, MAX_NODES - 1));
  if (me && volume.has(me as Address)) keep.add(me as Address);
  const node = (a: Address) => (keep.has(key(a)) ? key(a) : OTHERS);

  const pairs = new Map<string, { from: Address; to: Address; amount: bigint }>();
  const nets = new Map<Address, bigint>();
  const billsOf = new Map<Address, number>();
  const nodeVolume = new Map<Address, bigint>();
  let gross = 0n;
  for (const i of rows) {
    const d = node(i.debtor);
    const c = node(i.creditor);
    gross += i.amount;
    nets.set(d, (nets.get(d) ?? 0n) - i.amount);
    nets.set(c, (nets.get(c) ?? 0n) + i.amount);
    for (const n of [d, c]) {
      billsOf.set(n, (billsOf.get(n) ?? 0) + 1);
      nodeVolume.set(n, (nodeVolume.get(n) ?? 0n) + i.amount);
    }
    if (d === c) continue; // both inside "others"
    const k = `${d}>${c}`;
    const e = pairs.get(k) ?? { from: d, to: c, amount: 0n };
    e.amount += i.amount;
    pairs.set(k, e);
  }

  const nodes = [...nets.keys()].sort((a, b) => (a === OTHERS ? 1 : b === OTHERS ? -1 : a < b ? -1 : 1));
  const flows = nodes
    .filter((p) => (nets.get(p) ?? 0n) !== 0n)
    .map((p) => {
      const n = nets.get(p)!;
      return { party: p, direction: n < 0n ? ("in" as const) : ("out" as const), amount: n < 0n ? -n : n };
    });
  const net = flows.filter((f) => f.direction === "in").reduce((s, f) => s + f.amount, 0n);
  const edges = [...pairs.values()];
  const index = new Map(nodes.map((p, i) => [p, i]));
  const maxVolume = [...nodeVolume.values()].reduce((m, v) => (v > m ? v : m), 0n);
  const ranked = [...nets.entries()].sort((a, b) => {
    const av = a[1] < 0n ? -a[1] : a[1];
    const bv = b[1] < 0n ? -b[1] : b[1];
    return bv > av ? 1 : bv < av ? -1 : 0;
  });

  return {
    symbol: tokenSymbol(token),
    nodes,
    nets,
    edges,
    flows,
    gross,
    net,
    billsOf,
    volume: nodeVolume,
    ranked,
    byVolume: [...nets.entries()].sort((a, b) => ((nodeVolume.get(b[0]) ?? 0n) > (nodeVolume.get(a[0]) ?? 0n) ? 1 : -1)),
    partyCount: volume.size,
    hidden: volume.size - [...keep].length,
    maxEdge: edges.reduce((m, e) => (e.amount > m ? e.amount : m), 0n),
    maxFlow: flows.reduce((m, f) => (f.amount > m ? f.amount : m), 0n),
    maxNet: flows.reduce((m, f) => (f.amount > m ? f.amount : m), 0n),
    maxVolume,
    otherTokens: ious.length - rows.length,
    pos: (p: Address): Point => {
      const t = -Math.PI / 2 + (2 * Math.PI * (index.get(p) ?? 0)) / nodes.length;
      return { x: CX + RING * Math.cos(t), y: CY + RING * Math.sin(t) };
    },
    radius: (p: Address) => 14 + 10 * share(nodeVolume.get(p) ?? 0n, maxVolume),
  };
}
