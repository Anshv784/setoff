"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Inbox, X } from "lucide-react";
import type { InvoiceRequest } from "@/lib/data";
import { labelOf } from "@/lib/config";
import { fmtDate, fmtToken, shortAddr } from "@/lib/format";
import { decryptNote, isEncrypted } from "@/lib/private-notes";
import { Button } from "@/components/ui/button";
import { Party } from "@/components/setoff/party";
import { useApp } from "./state";

// Declined invoices are a per-browser convenience: nothing onchain changes.
const KEY = (a: string) => `setoff:declined:${a.toLowerCase()}`;
const listeners = new Set<() => void>();
const read = (a?: string): string => {
  if (!a) return "";
  try {
    return localStorage.getItem(KEY(a)) ?? "";
  } catch {
    return "";
  }
};
function decline(a: string, id: string) {
  try {
    localStorage.setItem(KEY(a), [read(a), id].filter(Boolean).join(","));
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Invoices sent to the connected wallet that it hasn't added or declined yet. */
export function useInbox(): InvoiceRequest[] {
  const { snapshot, account } = useApp();
  const declined = useSyncExternalStore(subscribe, () => read(account), () => "");
  if (!snapshot || !account) return [];
  const me = account.toLowerCase();
  const hidden = new Set(declined.split(","));
  return snapshot.invoiceRequests.filter((r) => r.invoice.iou.debtor.toLowerCase() === me && !hidden.has(r.id));
}

/** Pops a browser notification for each new invoice while a Setoff tab is open. */
export function InboxNotifier() {
  const { account } = useApp();
  const inbox = useInbox();
  useEffect(() => {
    if (!account || typeof Notification === "undefined") return;
    const k = `setoff:notified:${account.toLowerCase()}`;
    let seen: Set<string>;
    try {
      seen = new Set((localStorage.getItem(k) ?? "").split(","));
    } catch {
      return;
    }
    const fresh = inbox.filter((r) => !seen.has(r.id));
    if (fresh.length === 0) return;
    if (Notification.permission === "granted")
      for (const r of fresh) {
        const from = labelOf(r.invoice.iou.creditor)?.name ?? shortAddr(r.invoice.iou.creditor);
        new Notification(`${from} sent you an invoice`, { body: `${fmtToken(r.invoice.iou.amount, r.invoice.iou.token)} · review it in Setoff`, tag: r.id });
      }
    try {
      localStorage.setItem(k, [...seen, ...fresh.map((r) => r.id)].filter(Boolean).join(","));
    } catch {}
  }, [account, inbox]);
  return null;
}

/** Bills page: invoices waiting for you to approve or decline. */
export function WaitingForYou() {
  const { snapshot, account, noteKeys } = useApp();
  const inbox = useInbox();
  const router = useRouter();
  const [perm, setPerm] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  if (!account || !snapshot || inbox.length === 0) return null;
  const me = account.toLowerCase();
  const known = (c: string) => snapshot.ious.some((i) => [i.debtor, i.creditor].map((x) => x.toLowerCase()).includes(c.toLowerCase()) && [i.debtor, i.creditor].map((x) => x.toLowerCase()).includes(me));

  return (
    <section aria-labelledby="waiting" className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-primary/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="waiting" className="inline-flex items-center gap-2 text-base font-medium">
          <Inbox className="size-4 text-primary" aria-hidden /> Waiting for you
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{inbox.length}</span>
        </h2>
        {perm === "default" && (
          <Button variant="ghost" size="sm" onClick={() => Notification.requestPermission().then(setPerm)}>
            <Bell aria-hidden /> Notify me in this browser
          </Button>
        )}
        {perm === "granted" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <BellRing className="size-3.5" aria-hidden /> Browser notifications on
          </span>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {inbox.map((r) => {
          const { iou, note } = r.invoice;
          const text = !isEncrypted(note) ? note : noteKeys ? decryptNote(note, noteKeys) : undefined;
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <Party address={iou.creditor} />
                <span className="truncate text-sm text-muted-foreground">{text ?? "Private note"}</span>
                <span className="text-xs text-muted-foreground">
                  Due {fmtDate(iou.deadline)}
                  {!known(iou.creditor) && " · first bill from them"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums">{fmtToken(iou.amount, iou.token)}</span>
                <Button size="sm" onClick={() => router.push(`/app/bills?invoice=${r.param}`)}>
                  Review
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Decline" title="Decline (hides it here)" onClick={() => decline(account, r.id)}>
                  <X aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Nothing is owed until you approve. Declining just hides it here.</p>
    </section>
  );
}

/** Small count for the Bills nav item. */
export function InboxBadge() {
  const n = useInbox().length;
  if (n === 0) return null;
  return (
    <span aria-label={`${n} waiting`} className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
      {n}
    </span>
  );
}
