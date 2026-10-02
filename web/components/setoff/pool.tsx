"use client";

import { useState } from "react";
import type { IOURow, Snapshot } from "@/lib/data";
import { fmtToken } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Party, TxLink } from "./party";
import { Empty } from "./cycles";

const STATUS: Record<IOURow["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Open", variant: "default" },
  settled: { label: "Settled", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
  expired: { label: "Expired", variant: "outline" },
};

const PAGE = 25;

export function Pool({ snapshot, filter }: { snapshot: Snapshot; filter?: (i: IOURow) => boolean }) {
  const [limit, setLimit] = useState(PAGE);
  const rows = filter ? snapshot.ious.filter(filter) : snapshot.ious;
  if (rows.length === 0) {
    return <Empty title="No IOUs yet" body="Record what you owe someone and it joins the next cycle." />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owes</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Posted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Party address={i.debtor} />
                </TableCell>
                <TableCell>
                  <Party address={i.creditor} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{fmtToken(i.amount, i.token)}</TableCell>
                <TableCell className="max-w-72 truncate text-sm text-muted-foreground" title={i.note}>
                  {noteBody(i.note) ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS[i.status].variant}>
                    {STATUS[i.status].label}
                    {i.cycle ? ` · #${String(i.cycle)}` : ""}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TxLink hash={i.submittedTx} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > limit && (
        <Button variant="outline" className="self-start" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more
        </Button>
      )}
    </div>
  );
}

/** Demo notes read "Role invoice to Role: what, amount" — show the "what". */
function noteBody(note?: string) {
  if (!note) return undefined;
  const m = note.match(/^[^:]+:\s*(.*?)(,\s*[\d.]+\s*(USDC|EURC))?$/);
  return m?.[1] || note;
}
