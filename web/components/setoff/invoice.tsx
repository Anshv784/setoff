"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { toast } from "sonner";
import { Check, Copy, FileText, Wallet } from "lucide-react";
import { net } from "@/lib/config";
import { client } from "@/lib/data";
import { decodeInvoice, invoiceUrl, newIOU, type Invoice } from "@/lib/invoice";
import { fmtDate, fmtToken } from "@/lib/format";
import * as w from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Party } from "./party";
import { errorText, useTx } from "./tx";
import { isAmount, TokenSelect } from "./account";

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Creditor drafts a bill and gets a link to send the debtor. No transaction, no gas. */
export function SendInvoiceForm({ account, tokens }: { account: Address; tokens: Address[] }) {
  const [debtor, setDebtor] = useState("");
  const [token, setToken] = useState<Address>(tokens[0]!);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string>();
  const debtorError = debtor && !isAddress(debtor) ? "Enter a valid address" : same(debtor, account) ? "You can't bill yourself" : undefined;
  const valid = isAddress(debtor) && !debtorError && isAmount(amount) && note.trim().length > 0;

  if (link) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">Invoice ready. Send this link to the person who owes you — they approve it with a free signature.</p>
        <CopyField value={link} label="Invoice link" />
        <Button variant="outline" className="self-start" onClick={() => setLink(undefined)}>
          New invoice
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        try {
          const { timestamp } = await client.getBlock();
          const iou = newIOU({ debtor: debtor as Address, creditor: account, token, amount, days: 7, now: timestamp });
          setLink(invoiceUrl({ iou, note: note.trim() }));
        } catch (err) {
          toast.error(errorText(err));
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="inv-to">Who owes you</Label>
        <Input
          id="inv-to"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          className="font-mono"
          value={debtor}
          aria-invalid={!!debtorError}
          aria-describedby={debtorError ? "inv-to-err" : undefined}
          onChange={(e) => setDebtor(e.target.value.trim())}
        />
        {debtorError && (
          <p id="inv-to-err" className="text-xs text-destructive">
            {debtorError}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="inv-amount">Amount</Label>
          <Input id="inv-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <TokenSelect id="inv-token" tokens={tokens} value={token} onChange={setToken} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="inv-note">What it&apos;s for</Label>
        <Input id="inv-note" autoComplete="off" maxLength={120} placeholder="Invoice #1042, logo design" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">Creates a link — nothing is sent onchain until the debtor approves. Due within 7 days.</p>
      <Button type="submit" disabled={!valid}>
        Create invoice link
      </Button>
    </form>
  );
}

type Status = Awaited<ReturnType<typeof w.iouStatus>>["status"];

/** Opened from an invoice link: the debtor approves it, then anyone (usually the creditor) posts it. */
export function InvoiceView({
  param,
  account,
  onConnect,
  onChange,
  onClose,
}: {
  param: string;
  account?: Address;
  onConnect: () => void;
  onChange: () => void;
  onClose: () => void;
}) {
  const [sig, setSig] = useState<Hex>();
  const [status, setStatus] = useState<Status>();
  const [tick, setTick] = useState(0);
  const { busy, run } = useTx(() => {
    onChange();
    setTick((t) => t + 1);
  });

  const decoded = useMemo((): { inv?: Invoice; error?: string } => {
    try {
      return { inv: decodeInvoice(param) };
    } catch (e) {
      return { error: e instanceof Error && e.message.includes("deployment") ? e.message : "This invoice link is broken or incomplete." };
    }
  }, [param]);
  const inv = useMemo(() => (decoded.inv ? { ...decoded.inv, sig: sig ?? decoded.inv.sig } : undefined), [decoded, sig]);
  const error = decoded.error;

  useEffect(() => {
    if (!inv) return;
    let live = true;
    w.iouStatus(inv.iou)
      .then((s) => live && setStatus(s.status))
      .catch(() => live && setStatus(undefined));
    return () => {
      live = false;
    };
  }, [inv, tick]);

  if (error) {
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-destructive">{error}</p>
      </Shell>
    );
  }
  if (!inv) return null;

  const { iou } = inv;
  const isDebtor = same(account, iou.debtor);
  const isCreditor = same(account, iou.creditor);

  async function approve() {
    if (!account) return;
    try {
      const signature = await w.signInvoice(account, iou);
      setSig(signature);
      window.history.replaceState(null, "", invoiceUrl({ ...inv!, sig: signature }));
      toast.success("Approved. Send the link back, or post it now.");
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <Shell onClose={onClose}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Invoice from</span>
          <Party address={iou.creditor} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">Billed to</span>
          <Party address={iou.debtor} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-3xl tabular-nums">{fmtToken(iou.amount, iou.token)}</span>
        <span className="text-sm text-muted-foreground">{inv.note}</span>
        <span className="text-xs text-muted-foreground">Settle by {fmtDate(iou.deadline)}</span>
      </div>

      <StatusLine status={status} approved={!!inv.sig} />

      {status === "none" && (
        <div className="flex flex-col gap-3">
          {!account ? (
            <Button className="self-start" onClick={onConnect}>
              <Wallet aria-hidden /> Connect wallet
            </Button>
          ) : !inv.sig ? (
            isDebtor ? (
              <>
                <Button className="self-start" onClick={approve}>
                  <Check aria-hidden /> Approve invoice
                </Button>
                <p className="text-xs text-muted-foreground">
                  A free signature — no gas, no USDC needed. You still pay only your net position when the cycle settles.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for {isCreditor ? "the debtor" : "the billed address"} to approve. Only they can approve this invoice.
              </p>
            )
          ) : (
            <>
              <Button
                className="self-start"
                disabled={!!busy}
                onClick={() => run("Post invoice", () => w.postInvoice(account, inv))}
              >
                <FileText aria-hidden /> Add to Setoff
              </Button>
              <p className="text-xs text-muted-foreground">
                Posts the approved invoice onchain through Arc&apos;s Memo contract. Anyone can do this; it costs a fraction of a cent.
              </p>
              {isDebtor && <CopyField value={invoiceUrl(inv)} label="Or send the approved link back to the creditor" />}
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

function StatusLine({ status, approved }: { status?: Status; approved: boolean }) {
  if (status === "pending") return <Badge>In the pool — settles in the next fundable cycle</Badge>;
  if (status === "settled") return <Badge variant="secondary">Settled</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  if (status === "none") return <Badge variant="outline">{approved ? "Approved — not posted yet" : "Awaiting approval"}</Badge>;
  return null;
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <section aria-labelledby="invoice" className="flex flex-col gap-6 rounded-lg border p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="invoice" className="text-xl font-semibold">
          Invoice
        </h2>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {children}
      <p className="text-xs text-muted-foreground">On {net.name}</p>
    </section>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="copy-field">{label}</Label>
      <div className="flex gap-2">
        <Input id="copy-field" readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          aria-label="Copy link"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
