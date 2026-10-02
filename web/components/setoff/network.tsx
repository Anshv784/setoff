"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { labelOf, tokenSymbol } from "@/lib/config";
import type { IOURow, Snapshot } from "@/lib/data";
import { fmtAmount, shortAddr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Empty } from "./cycles";

type View = "before" | "after";

const W = 640;
const H = 420;
const CX = W / 2;
const CY = H / 2;
const R = 160;
const NODE = 7;

/** Who owes whom in one cycle: every IOU as an arrow, vs. only the net flows through Setoff. */
export function NetworkView({ snapshot }: { snapshot: Snapshot }) {
  const cycleIds = snapshot.cycles.map((c) => String(c.cycle));
  const hasOpen = snapshot.ious.some((i) => i.status === "pending");
  const options = [...(hasOpen ? ["open"] : []), ...cycleIds];
  const [picked, setPicked] = useState<string>();
  const [view, setView] = useState<View>("before");
  const source = picked && options.includes(picked) ? picked : options[0];

  const ious = useMemo(
    () =>
      source === "open"
        ? snapshot.ious.filter((i) => i.status === "pending")
        : snapshot.ious.filter((i) => i.status === "settled" && String(i.cycle) === source),
    [snapshot, source],
  );
  const graph = useMemo(() => build(ious), [ious]);

  if (!source || !graph) {
    return <Empty title="Nothing to draw yet" body="The diagram appears once there are IOUs in the pool or a settled cycle." />;
  }

  const saved = graph.gross === 0n ? 0 : Number(((graph.gross - graph.net) * 1000n) / graph.gross) / 10;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Diagram view" className="inline-flex rounded-lg border p-1">
          {(["before", "after"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "before" ? `Before · ${graph.edges.length} payments` : `After netting · ${graph.flows.length} payments`}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Show
          <select
            value={source}
            onChange={(e) => setPicked(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o === "open" ? "Open IOUs (next cycle)" : `Cycle #${o}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto h-auto w-full max-w-2xl text-foreground"
          role="img"
          aria-label={
            view === "before"
              ? `${graph.edges.length} separate payments totalling ${fmtAmount(graph.gross)} ${graph.symbol}`
              : `${graph.flows.length} net payments totalling ${fmtAmount(graph.net)} ${graph.symbol}`
          }
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
            </marker>
            <marker id="arrow-strong" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
            </marker>
          </defs>

          {view === "before"
            ? graph.edges.map((e, i) => <Edge key={i} from={graph.pos(e.from)} to={graph.pos(e.to)} amount={e.amount} max={graph.maxEdge} bend />)
            : graph.flows.map((f, i) =>
                f.direction === "in" ? (
                  <Edge key={i} from={graph.pos(f.party)} to={{ x: CX, y: CY }} amount={f.amount} max={graph.maxFlow} strong toHub />
                ) : (
                  <Edge key={i} from={{ x: CX, y: CY }} to={graph.pos(f.party)} amount={f.amount} max={graph.maxFlow} strong fromHub />
                ),
              )}

          {view === "after" && (
            <g>
              <circle cx={CX} cy={CY} r={28} className="fill-background stroke-primary" strokeWidth={1.5} />
              <text x={CX} y={CY + 4} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
                Setoff
              </text>
            </g>
          )}

          {graph.parties.map((p) => {
            const { x, y } = graph.pos(p);
            const net = graph.nets.get(p) ?? 0n;
            const right = x >= CX;
            return (
              <g key={p}>
                <circle cx={x} cy={y} r={NODE} className="fill-foreground" />
                <text
                  x={x + (right ? 14 : -14)}
                  y={y - 2}
                  textAnchor={right ? "start" : "end"}
                  className="fill-foreground text-[12px]"
                >
                  {nameOf(p)}
                </text>
                {view === "after" && (
                  <text
                    x={x + (right ? 14 : -14)}
                    y={y + 13}
                    textAnchor={right ? "start" : "end"}
                    className="fill-muted-foreground font-mono text-[11px]"
                  >
                    {net === 0n ? "even" : `${net > 0n ? "+" : "−"}${fmtAmount(net > 0n ? net : -net)}`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-sm text-muted-foreground">
        {view === "before" ? (
          <>
            Paid one by one: <span className="font-mono text-foreground">{graph.edges.length}</span> payments moving{" "}
            <span className="font-mono text-foreground">
              {fmtAmount(graph.gross)} {graph.symbol}
            </span>
            .
          </>
        ) : (
          <>
            Through Setoff: <span className="font-mono text-foreground">{graph.flows.length}</span> net positions,{" "}
            <span className="font-mono text-foreground">
              {fmtAmount(graph.net)} {graph.symbol}
            </span>{" "}
            moved. <span className="text-foreground">{saved}%</span> never had to.
          </>
        )}
        {graph.otherTokens > 0 && ` (${graph.otherTokens} IOUs in other currencies not shown.)`}
      </p>
    </div>
  );
}

function nameOf(a: Address) {
  const l = labelOf(a);
  return l ? l.name.replace(/ \(demo\)$/, "") : shortAddr(a);
}

type Point = { x: number; y: number };

function Edge({
  from,
  to,
  amount,
  max,
  bend,
  strong,
  toHub,
  fromHub,
}: {
  from: Point;
  to: Point;
  amount: bigint;
  max: bigint;
  bend?: boolean;
  strong?: boolean;
  toHub?: boolean;
  fromHub?: boolean;
}) {
  // Trim the line so arrowheads sit outside the circles they point at.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const startPad = fromHub ? 30 : NODE + 3;
  const endPad = toHub ? 32 : NODE + 5;
  const a = { x: from.x + ux * startPad, y: from.y + uy * startPad };
  const b = { x: to.x - ux * endPad, y: to.y - uy * endPad };
  // Curve pairwise debts so A→B and B→A don't overlap.
  const c = bend ? { x: (a.x + b.x) / 2 - uy * 28, y: (a.y + b.y) / 2 + ux * 28 } : undefined;
  const width = 1 + 3 * (max === 0n ? 0 : Number((amount * 1000n) / max) / 1000);
  const d = c ? `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}` : `M${a.x},${a.y} L${b.x},${b.y}`;
  return (
    <path
      d={d}
      fill="none"
      strokeWidth={width}
      strokeLinecap="round"
      markerEnd={`url(#${strong ? "arrow-strong" : "arrow"})`}
      className={strong ? "stroke-primary" : "stroke-muted-foreground/70"}
    >
      <title>{fmtAmount(amount)}</title>
    </path>
  );
}

function build(ious: IOURow[]) {
  if (ious.length === 0) return undefined;
  // Draw the currency with the most face value; currencies never net against each other.
  const byToken = new Map<string, bigint>();
  for (const i of ious) byToken.set(i.token.toLowerCase(), (byToken.get(i.token.toLowerCase()) ?? 0n) + i.amount);
  const token = [...byToken].sort((a, b) => (b[1] > a[1] ? 1 : -1))[0]![0];
  const rows = ious.filter((i) => i.token.toLowerCase() === token);

  const pairs = new Map<string, { from: Address; to: Address; amount: bigint }>();
  const nets = new Map<Address, bigint>();
  const key = (a: Address) => a.toLowerCase() as Address;
  let gross = 0n;
  for (const i of rows) {
    const k = `${key(i.debtor)}>${key(i.creditor)}`;
    const e = pairs.get(k) ?? { from: key(i.debtor), to: key(i.creditor), amount: 0n };
    e.amount += i.amount;
    pairs.set(k, e);
    nets.set(key(i.debtor), (nets.get(key(i.debtor)) ?? 0n) - i.amount);
    nets.set(key(i.creditor), (nets.get(key(i.creditor)) ?? 0n) + i.amount);
    gross += i.amount;
  }
  const parties = [...nets.keys()].sort();
  const flows = parties
    .filter((p) => nets.get(p) !== 0n)
    .map((p) => {
      const n = nets.get(p)!;
      return { party: p, direction: n < 0n ? ("in" as const) : ("out" as const), amount: n < 0n ? -n : n };
    });
  const net = flows.filter((f) => f.direction === "in").reduce((s, f) => s + f.amount, 0n);
  const edges = [...pairs.values()];
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / parties.length;
  const index = new Map(parties.map((p, i) => [p, i]));

  return {
    symbol: tokenSymbol(token),
    parties,
    nets,
    edges,
    flows,
    gross,
    net,
    maxEdge: edges.reduce((m, e) => (e.amount > m ? e.amount : m), 0n),
    maxFlow: flows.reduce((m, f) => (f.amount > m ? f.amount : m), 0n),
    otherTokens: ious.length - rows.length,
    pos: (p: Address): Point => {
      const t = angle(index.get(key(p)) ?? 0);
      return { x: CX + R * Math.cos(t), y: CY + R * Math.sin(t) };
    },
  };
}
