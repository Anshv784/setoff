import { savedBps, type Snapshot } from "@/lib/data";
import { fmtAgo, fmtDate, fmtPct, fmtToken } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TxLink } from "./party";

export function Cycles({ snapshot, limit }: { snapshot: Snapshot; limit?: number }) {
  if (snapshot.cycles.length === 0) {
    return (
      <Empty title="No cycles yet" body="The solver settles a cycle as soon as the open IOUs can be funded by deposits." />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cycle</TableHead>
            <TableHead>When</TableHead>
            <TableHead className="text-right">IOUs</TableHead>
            <TableHead className="text-right">Cleared</TableHead>
            <TableHead className="text-right">Moved</TableHead>
            <TableHead className="text-right">Saved</TableHead>
            <TableHead>Settlement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshot.cycles.slice(0, limit).map((c) => {
            const tokens = Object.keys(c.gross).filter((t) => (c.gross[t] ?? 0n) > 0n);
            const g = tokens.reduce((s, t) => s + c.gross[t]!, 0n);
            const n = tokens.reduce((s, t) => s + (c.netFunded[t] ?? 0n), 0n);
            return (
              <TableRow key={String(c.cycle)}>
                <TableCell className="font-mono tabular-nums">#{String(c.cycle)}</TableCell>
                <TableCell className="text-muted-foreground" title={c.timestamp ? fmtDate(c.timestamp) : undefined}>
                  {c.timestamp ? fmtAgo(c.timestamp, snapshot.now) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{String(c.iouCount)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {tokens.map((t) => (
                    <div key={t}>{fmtToken(c.gross[t]!, t)}</div>
                  ))}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {tokens.map((t) => (
                    <div key={t}>{fmtToken(c.netFunded[t] ?? 0n, t)}</div>
                  ))}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {fmtPct(savedBps(g, n))}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TxLink hash={c.tx}>{c.memo ? "Memo tx ↗" : "tx ↗"}</TxLink>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-8">
      <p className="text-base font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
