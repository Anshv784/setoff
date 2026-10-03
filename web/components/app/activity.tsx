"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { labelOf, net, USDC } from "@/lib/config";
import { savedBps, totals, type IOURow, type Snapshot } from "@/lib/data";
import { fmtAgo, fmtAmount, fmtDate, fmtPct, fmtToken } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Party } from "@/components/setoff/party";
import { isEncrypted } from "@/lib/private-notes";
import { readNote } from "@/lib/notes-view";
import { NoteText } from "./notes";
import { useApp } from "./state";

type Tab = "cycles" | "open" | "bills";
type Status = "all" | IOURow["status"];

const usdcKey = USDC.toLowerCase();
const PAGE = 25;

export function Activity() {
  const { snapshot } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: Tab = raw === "open" || raw === "bills" ? raw : "cycles";
  const setTab = (t: Tab) => router.replace(t === "cycles" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  if (!snapshot) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const t = totals(snapshot);
  const open = snapshot.ious.filter((i) => i.status === "pending").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Activity</h1>
        <p className="text-sm text-muted-foreground">Every cycle and every bill, read live from the contract.</p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        {[
          ["Cycles", String(snapshot.cycles.length)],
          ["Bills", String(snapshot.ious.length)],
          ["Cleared", `${fmtAmount(t.gross[usdcKey] ?? 0n)} USDC`],
          ["Moved", `${fmtAmount(t.netFunded[usdcKey] ?? 0n)} USDC`],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 bg-card p-5">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-mono text-xl tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div role="tablist" aria-label="Activity views" className="flex gap-1 border-b border-border">
        {(
          [
            ["cycles", `Cycles`, snapshot.cycles.length],
            ["open", `Open bills`, open],
            ["bills", `All bills`, snapshot.ious.length],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`relative -mb-px flex h-11 items-center gap-2 px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className={`rounded-full px-2 py-0.5 font-mono text-xs ${tab === k ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{n}</span>
            {tab === k && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "cycles" ? <CycleList snapshot={snapshot} /> : <Bills snapshot={snapshot} initial={tab === "open" ? "pending" : "all"} key={tab} />}
    </div>
  );
}

function CycleList({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.cycles.length === 0) {
    return <Empty title="No cycles yet" body="The first cycle runs as soon as open bills are funded by deposits." />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {snapshot.cycles.map((c) => {
        const g = c.gross[usdcKey] ?? 0n;
        const n = c.netFunded[usdcKey] ?? 0n;
        const share = g === 0n ? 0 : Number((n * 10_000n) / g) / 100;
        return (
          <li key={String(c.cycle)} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-[6rem_1fr_auto] md:items-center">
            <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-1">
              <span className="font-mono text-lg">#{String(c.cycle)}</span>
              <span className="text-xs text-muted-foreground" title={c.timestamp ? fmtDate(c.timestamp) : undefined}>
                {c.timestamp ? fmtAgo(c.timestamp, snapshot.now) : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {String(c.iouCount)} bills cleared ·{" "}
                  <span className="font-mono text-foreground">{fmtAmount(g)}</span> owed ·{" "}
                  <span className="font-mono text-foreground">{fmtAmount(n)}</span> moved
                </span>
                <span className="font-mono text-sm tabular-nums">{fmtPct(savedBps(g, n))} saved</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`Moved ${fmtAmount(n)} of ${fmtAmount(g)} USDC`}
                title={`Moved ${fmtAmount(n)} of ${fmtAmount(g)} USDC`}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(n > 0n ? 1.5 : 0, share)}%` }} />
              </div>
              {c.memo && <p className="truncate text-xs text-muted-foreground" title={c.memo}>Memo: {c.memo}</p>}
            </div>
            {net.local ? (
              <span className="font-mono text-xs text-muted-foreground">local tx</span>
            ) : (
              <a
                href={`${net.explorer}/tx/${c.tx}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 justify-self-start rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:justify-self-end"
              >
                Transaction <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_LABEL: Record<IOURow["status"], string> = { pending: "Open", settled: "Settled", cancelled: "Cancelled", expired: "Expired", disputed: "Disputed" };
const STATUS_STYLE: Record<IOURow["status"], string> = {
  pending: "border-primary/40 bg-primary/10 text-primary",
  settled: "border-border bg-muted text-foreground",
  cancelled: "border-border text-muted-foreground",
  expired: "border-border text-muted-foreground",
  disputed: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

function noteOf(i: IOURow) {
  if (!i.note || isEncrypted(i.note)) return undefined;
  const m = i.note.match(/^[^:]+:\s*(.*?)(,\s*[\d.]+\s*(USDC|EURC))?$/);
  return m?.[1] || i.note;
}

function Bills({ snapshot, initial }: { snapshot: Snapshot; initial: Status }) {
  const { account, noteKeys, unlockNotes } = useApp();
  const [status, setStatus] = useState<Status>(initial);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { all: snapshot.ious.length, pending: 0, settled: 0, cancelled: 0, expired: 0, disputed: 0 };
    for (const i of snapshot.ious) c[i.status]++;
    return c;
  }, [snapshot]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return snapshot.ious.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (!term) return true;
      const hay = [i.debtor, i.creditor, labelOf(i.debtor)?.name, labelOf(i.creditor)?.name, i.note].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [snapshot, status, q]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {(["all", "pending", "disputed", "settled", "cancelled", "expired"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setLimit(PAGE);
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                status === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
              <span className="font-mono text-xs opacity-80">{counts[s]}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">Search bills</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, address or note" className="h-9 pl-9" autoComplete="off" />
        </label>
      </div>

      {rows.length === 0 ? (
        <Empty title="No bills match" body={q ? "Try a different name, address or note." : "Nothing in this status yet."} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[1.2fr_1.2fr_7rem_1.4fr_7rem] gap-4 border-b border-border bg-card px-5 py-3 text-xs text-muted-foreground md:grid">
            <span>From (owes)</span>
            <span>To (is owed)</span>
            <span className="text-right">Amount</span>
            <span>For</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.slice(0, limit).map((i) => (
              <li key={i.id} className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-card/60 md:grid-cols-[1.2fr_1.2fr_7rem_1.4fr_7rem] md:items-center">
                <Party address={i.debtor} />
                <Party address={i.creditor} />
                <span className="font-mono text-sm tabular-nums md:text-right">{fmtToken(i.amount, i.token)}</span>
                <span className="truncate text-sm text-muted-foreground" title={isEncrypted(i.note) ? undefined : i.note}>
                  {isEncrypted(i.note) ? (
                    <NoteText view={readNote(i, account, noteKeys)} canUnlock={!!account && !!snapshot.noteKeys[account.toLowerCase()]} onUnlock={() => void unlockNotes()} />
                  ) : (
                    (noteOf(i) ?? "—")
                  )}
                </span>
                <span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[i.status]}`}>
                    {STATUS_LABEL[i.status]}
                    {i.status === "pending" && i.paid > 0n
                      ? ` · ${Number((i.paid * 100n) / i.amount)}% paid`
                      : i.status === "settled" && i.cycle
                        ? ` · #${String(i.cycle)}`
                        : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows.length > limit && (
        <Button variant="outline" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
        </Button>
      )}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
