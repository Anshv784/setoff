"use client";

import { useEffect, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { BadgeCheck, Wallet } from "lucide-react";
import { identities, net, tokenSymbol } from "@/lib/config";
import { remainingOf, type IOURow, type Snapshot } from "@/lib/data";
import { fmtDate, fmtToken, shortAddr } from "@/lib/format";
import * as w from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Party } from "./party";
import type { NoteKeys } from "@/lib/private-notes";
import { readNote, sealNote } from "@/lib/notes-view";
import { NoteText, PrivateToggle, privacyStatus, type PrivacyStatus } from "@/components/app/notes";
import { Empty } from "./cycles";
import { SendInvoiceForm } from "./invoice";
import { useTx } from "./tx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Bal = Awaited<ReturnType<typeof w.balances>>;

export function Account({
  part,
  snapshot,
  account,
  onConnect,
  onChange,
  noteKeys,
  onUnlock,
}: {
  /** "wallet": deposits, net hint, name. "bills": add a bill + your IOUs. */
  part: "wallet" | "bills";
  snapshot: Snapshot;
  account?: Address;
  onConnect: () => void;
  onChange: () => void;
  /** Unlocked private-note keys for this session, if any. */
  noteKeys?: NoteKeys;
  onUnlock?: () => void;
  /** Extra cards for the wallet page's right column. */
}) {
  const [bals, setBals] = useState<Bal>();
  const [billTab, setBillTab] = useState<"open" | "disputed" | "done">("open");
  const [tick, setTick] = useState(0);
  const { busy, run } = useTx(() => {
    onChange();
    setTick((t) => t + 1);
  });

  useEffect(() => {
    // Re-read balances whenever the chain snapshot refreshes or we send a transaction.
    let live = true;
    if (account)
      w.balances(account, snapshot.tokens)
        .then((b) => live && setBals(b))
        .catch(() => live && setBals(undefined));
    return () => {
      live = false;
    };
  }, [account, snapshot, tick]);

  if (!account) {
    return (
      <Empty
        title="Connect a wallet"
        body={part === "wallet" ? `See your deposits and what to fund for the next cycle. Runs on ${net.name}.` : `Send invoices and record what you owe. Runs on ${net.name}.`}
      >
        <Button className="mt-2" onClick={onConnect}>
          <Wallet aria-hidden /> Connect wallet
        </Button>
      </Empty>
    );
  }

  const mine = (i: IOURow) => [i.debtor, i.creditor].some((a) => a.toLowerCase() === account.toLowerCase());
  const myIous = snapshot.ious.filter(mine);
  const shownIous = myIous.filter((i) =>
    billTab === "open" ? i.status === "pending" : billTab === "disputed" ? i.status === "disputed" : !["pending", "disputed"].includes(i.status),
  );

  const card = "flex flex-col gap-5 rounded-xl border border-border bg-card p-6";

  if (part === "wallet") {
    return (
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="bal" className={card}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="bal" className="text-base font-medium">
              Your deposits
            </h2>
            <span className="font-mono text-xs text-muted-foreground">{shortAddr(account)}</span>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {(bals ?? snapshot.tokens.map((token) => ({ token, deposit: undefined, wallet: undefined }))).map((b) => (
              <li key={b.token} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{tokenSymbol(b.token)} in Setoff</span>
                  <span className="font-mono text-xl tabular-nums">{b.deposit === undefined ? "…" : fmtToken(b.deposit, b.token)}</span>
                  <span className="text-xs text-muted-foreground">in wallet {b.wallet === undefined ? "…" : fmtToken(b.wallet, b.token)}</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- static token mark */}
                <img src={`/logos/${tokenSymbol(b.token).toLowerCase()}.svg`} alt="" className="size-8 opacity-80" />
              </li>
            ))}
          </ul>
          <MoveForm
            tokens={snapshot.tokens}
            bals={bals}
            busy={!!busy}
            onDeposit={(t, a) => run(`Deposit ${a} ${tokenSymbol(t)}`, () => w.deposit(account, t, a))}
            onWithdraw={(t, v) => run(`Withdraw ${formatUnits(v, 6)} ${tokenSymbol(t)}`, () => w.withdraw(account, t, v))}
          />
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="next" className={card}>
            <h2 id="next" className="text-base font-medium">
              For the next cycle
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="pb-2 font-normal">Open bills</th>
                  <th className="pb-2 pl-3 text-right font-normal">You owe</th>
                  <th className="pb-2 pl-3 text-right font-normal">Owed to you</th>
                  <th className="pb-2 pl-3 text-right font-normal">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono tabular-nums">
                {snapshot.tokens.map((t) => {
                  const open = myIous.filter((i) => i.status === "pending" && i.token.toLowerCase() === t.toLowerCase());
                  const me = account.toLowerCase();
                  const owe = open.filter((i) => i.debtor.toLowerCase() === me).reduce((x, i) => x + remainingOf(i), 0n);
                  const owed = open.filter((i) => i.creditor.toLowerCase() === me).reduce((x, i) => x + remainingOf(i), 0n);
                  const n = owed - owe;
                  const amt = (v: bigint) => Number(formatUnits(v, 6)).toFixed(2);
                  return (
                    <tr key={t}>
                      <td className="py-2 font-sans text-muted-foreground">{tokenSymbol(t)}</td>
                      <td className="py-2 pl-3 text-right">{amt(owe)}</td>
                      <td className="py-2 pl-3 text-right">{amt(owed)}</td>
                      <td className={`py-2 pl-3 text-right ${n < 0n ? "text-amber-400" : n > 0n ? "text-primary" : ""}`}>
                        {n < 0n ? "−" : n > 0n ? "+" : ""}
                        {amt(n < 0n ? -n : n)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <NetHint
              account={account}
              snapshot={snapshot}
              bals={bals}
              busy={!!busy}
              onDeposit={(t, a) => run(`Deposit ${a} ${tokenSymbol(t)}`, () => w.deposit(account, t, a))}
            />
          </section>
          <section aria-labelledby="name" className={card}>
            <h2 id="name" className="text-base font-medium">
              Profile
            </h2>
            <NameRow account={account} busy={!!busy} onRegister={(name) => run("Register name", () => w.registerName(account, name))} />
          </section>
        </div>
      </div>
    );
  }

  const open = myIous.filter((i) => i.status === "pending");
  const sum = (rows: IOURow[]) => rows.reduce((s, i) => s + remainingOf(i), 0n);
  const youOwe = open.filter((i) => i.debtor.toLowerCase() === account.toLowerCase() && i.token === snapshot.tokens[0]);
  const owedYou = open.filter((i) => i.creditor.toLowerCase() === account.toLowerCase() && i.token === snapshot.tokens[0]);
  const usdc = snapshot.tokens[0]!;
  const position = sum(owedYou) - sum(youOwe);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="bill" className={`${card} lg:sticky lg:top-24`}>
        <h2 id="bill" className="text-base font-medium">
          Add a bill
        </h2>
        <Tabs defaultValue="invoice">
          <TabsList>
            <TabsTrigger value="invoice">Send an invoice</TabsTrigger>
            <TabsTrigger value="owe">Record what I owe</TabsTrigger>
          </TabsList>
          <TabsContent value="invoice" className="pt-4">
            <SendInvoiceForm account={account} tokens={snapshot.tokens} snapshot={snapshot} />
          </TabsContent>
          <TabsContent value="owe" className="pt-4">
            <IOUForm
              account={account}
              tokens={snapshot.tokens}
              busy={!!busy}
              privacy={(creditor) => privacyStatus(snapshot, account, creditor)}
              onSubmit={({ private: priv, ...input }) =>
                run("Record IOU", () =>
                  w.recordIOU(account, { ...input, note: (priv && sealNote(snapshot, account, input.creditor, input.note)) || input.note }),
                )
              }
            />
          </TabsContent>
        </Tabs>
      </section>

      <section aria-labelledby="mine" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="mine" className="text-base font-medium">
            Your bills
          </h2>
          <Button
            variant="outline"
            size="sm"
            disabled={!myIous.some((i) => i.status === "settled")}
            onClick={() => exportCsv(account, myIous, snapshot, noteKeys)}
          >
            Export CSV
          </Button>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
          {[
            ["You owe", fmtToken(sum(youOwe), usdc), `${youOwe.length} open`],
            ["Owed to you", fmtToken(sum(owedYou), usdc), `${owedYou.length} open`],
            ["Your net", `${position > 0n ? "+" : position < 0n ? "−" : ""}${fmtToken(position < 0n ? -position : position, usdc)}`, position < 0n ? "to fund" : position > 0n ? "to receive" : "even"],
          ].map(([k, v, sub]) => (
            <div key={k} className="flex flex-col gap-1 bg-card p-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-mono text-sm tabular-nums">{v}</dd>
              <dd className="text-xs text-muted-foreground">{sub}</dd>
            </div>
          ))}
        </dl>
        {myIous.length === 0 ? (
          <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium">No bills yet</p>
            <p className="text-sm text-muted-foreground">Bills you send, owe or settle show up here.</p>
          </div>
        ) : (
          <>
          <div role="tablist" aria-label="Filter your bills" className="inline-flex w-fit rounded-lg border border-border bg-background p-0.5">
            {(
              [
                ["open", "Open", myIous.filter((i) => i.status === "pending").length],
                ["disputed", "Disputed", myIous.filter((i) => i.status === "disputed").length],
                ["done", "Done", myIous.filter((i) => !["pending", "disputed"].includes(i.status)).length],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={billTab === k}
                onClick={() => setBillTab(k)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  billTab === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label} <span className="font-mono text-xs opacity-70">{n}</span>
              </button>
            ))}
          </div>
          {shownIous.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nothing here.</p>
          ) : (
          <ul className="flex max-h-[min(36rem,calc(100svh-16rem))] flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {shownIous.map((i) => {
              const owe = i.debtor.toLowerCase() === account.toLowerCase();
              return (
                <li key={i.id} className="flex flex-col gap-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{owe ? "You owe" : "Owes you"}</span>
                      <Party address={owe ? i.creditor : i.debtor} />
                      {i.note && (
                        <span className="truncate text-xs text-muted-foreground">
                          <NoteText view={readNote(i, account, noteKeys)} canUnlock={!!snapshot.noteKeys[account.toLowerCase()]} onUnlock={onUnlock} />
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-sm tabular-nums">{fmtToken(i.amount, i.token)}</span>
                      <span className={`text-xs ${i.status === "disputed" ? "text-amber-300" : "text-muted-foreground"}`}>{billStatus(i)}</span>
                    </div>
                    {i.status === "pending" ? (
                      <div className="flex shrink-0 flex-col items-end">
                        <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run(owe ? "Cancel bill" : "Reject bill", () => w.cancel(account, i.id))}>
                          {owe ? "Cancel" : "Reject"}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run("Dispute bill", () => w.disputeBill(account, i.id))}>
                          Dispute
                        </Button>
                      </div>
                    ) : (
                      <span className="w-[4.5rem]" aria-hidden />
                    )}
                  </div>
                  {i.status === "pending" && i.paid > 0n && (
                    <div className="h-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${fmtToken(i.paid, i.token)} of ${fmtToken(i.amount, i.token)} paid`}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Number((i.paid * 100n) / i.amount)}%` }} />
                    </div>
                  )}
                  {i.status === "disputed" && (
                    <DisputePanel
                      iou={i}
                      owe={owe}
                      busy={!!busy}
                      onOffer={(v) => run("Propose amount", () => w.offerAmount(account, i.id, v))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          )}
          </>
        )}
      </section>
    </div>
  );
}

function billStatus(i: IOURow) {
  if (i.status === "settled") return i.cycle ? `Settled · #${String(i.cycle)}` : "Settled";
  if (i.status === "disputed") return "Disputed";
  if (i.status === "pending") return i.paid > 0n ? `Part paid · ${fmtToken(i.paid, i.token)}` : "Open";
  return i.status === "cancelled" ? "Cancelled" : "Expired";
}

/** Both sides propose what's still owed; matching proposals reopen the bill (0 cancels it). */
function DisputePanel({ iou, owe, busy, onOffer }: { iou: IOURow; owe: boolean; busy: boolean; onOffer: (remaining: bigint) => void }) {
  const [amount, setAmount] = useState("");
  const open = iou.amount - iou.paid;
  const mine = owe ? iou.offers?.debtor : iou.offers?.creditor;
  const theirs = owe ? iou.offers?.creditor : iou.offers?.debtor;
  const value = isAmount(amount) || amount === "0" ? parseUnits(amount, 6) : undefined;
  const tooMuch = value !== undefined && value > open;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs leading-5 text-muted-foreground">
        Frozen: no cycle can pay this until you both propose the same amount still owed ({fmtToken(open, iou.token)} open). Propose 0 to cancel it.
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="text-muted-foreground">
          You proposed: <span className="font-mono text-foreground">{mine === undefined ? "—" : fmtToken(mine, iou.token)}</span>
        </span>
        <span className="text-muted-foreground">
          They proposed: <span className="font-mono text-foreground">{theirs === undefined ? "—" : fmtToken(theirs, iou.token)}</span>
        </span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value !== undefined && !tooMuch) onOffer(value);
        }}
      >
        <Input
          aria-label="Amount still owed"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Still owed, e.g. 8.00"
          value={amount}
          aria-invalid={tooMuch}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 font-mono text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={value === undefined || tooMuch || busy}>
          Propose
        </Button>
        {theirs !== undefined && (
          <Button type="button" size="sm" disabled={busy} onClick={() => onOffer(theirs)}>
            Accept {fmtToken(theirs, iou.token)}
          </Button>
        )}
      </form>
    </div>
  );
}

function MoveForm({
  tokens,
  bals,
  busy,
  onDeposit,
  onWithdraw,
}: {
  tokens: Address[];
  bals?: Bal;
  busy: boolean;
  onDeposit: (t: Address, amount: string) => void;
  onWithdraw: (t: Address, amount: bigint) => void;
}) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [token, setToken] = useState<Address>(tokens[0]!);
  const [amount, setAmount] = useState("");
  const bal = bals?.find((b) => b.token === token);
  const available = mode === "deposit" ? bal?.wallet : bal?.deposit;
  const value = isAmount(amount) ? parseUnits(amount, 6) : 0n;
  const tooMuch = available !== undefined && value > available;
  const valid = value > 0n && !tooMuch;

  return (
    <form
      className="flex flex-col gap-4 border-t border-border pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        if (mode === "deposit") onDeposit(token, amount);
        else onWithdraw(token, value);
        setAmount("");
      }}
    >
      <div role="tablist" aria-label="Move funds" className="inline-flex w-fit rounded-lg border border-border bg-background p-0.5">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setAmount("");
            }}
            className={`h-8 rounded-md px-3 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="move-amount">Amount</Label>
            <span className="text-xs text-muted-foreground">
              {mode === "deposit" ? "In wallet" : "In Setoff"}: {available === undefined ? "…" : fmtToken(available, token)}
            </span>
          </div>
          <div className="relative">
            <Input
              id="move-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              aria-invalid={tooMuch}
              aria-describedby={tooMuch ? "move-err" : undefined}
              onChange={(e) => setAmount(e.target.value)}
              className="pr-14 font-mono"
            />
            <button
              type="button"
              disabled={!available}
              onClick={() => available !== undefined && setAmount(formatUnits(available, 6))}
              className="absolute right-1.5 top-1/2 h-6 -translate-y-1/2 rounded px-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Max
            </button>
          </div>
        </div>
        <TokenSelect id="move-token" tokens={tokens} value={token} onChange={setToken} />
      </div>
      {tooMuch && (
        <p id="move-err" className="text-xs text-destructive">
          That&apos;s more than you have {mode === "deposit" ? "in your wallet" : "in Setoff"}.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {mode === "deposit"
          ? "Approve and deposit happen in one transaction via Arc's Multicall3From."
          : "Withdraw any time. Only you can move your balance."}
      </p>
      <Button type="submit" disabled={!valid || busy}>
        {mode === "deposit" ? "Deposit" : "Withdraw"}
        {valid ? ` ${amount} ${tokenSymbol(token)}` : ""}
      </Button>
    </form>
  );
}

function IOUForm({
  account,
  tokens,
  busy,
  privacy,
  onSubmit,
}: {
  account: Address;
  tokens: Address[];
  busy: boolean;
  privacy: (creditor?: Address) => PrivacyStatus | undefined;
  onSubmit: (input: { creditor: Address; token: Address; amount: string; days: number; note: string; private: boolean }) => void;
}) {
  const [creditor, setCreditor] = useState("");
  const [keepPrivate, setKeepPrivate] = useState(true);
  const [token, setToken] = useState<Address>(tokens[0]!);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const creditorError =
    creditor && !isAddress(creditor) ? "Enter a valid address" : creditor.toLowerCase() === account.toLowerCase() ? "You can't owe yourself" : undefined;
  const valid = isAddress(creditor) && !creditorError && isAmount(amount) && note.trim().length > 0;
  const status = privacy(isAddress(creditor) ? (creditor as Address) : undefined);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ creditor: creditor as Address, token, amount, days: 7, note: note.trim(), private: status === "ready" && keepPrivate });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="iou-to">Who you owe</Label>
        <Input
          id="iou-to"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          className="font-mono"
          value={creditor}
          aria-invalid={!!creditorError}
          aria-describedby={creditorError ? "iou-to-err" : undefined}
          onChange={(e) => setCreditor(e.target.value.trim())}
        />
        {creditorError && (
          <p id="iou-to-err" className="text-xs text-destructive">
            {creditorError}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="iou-amount">Amount</Label>
          <Input id="iou-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <TokenSelect id="iou-token" tokens={tokens} value={token} onChange={setToken} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="iou-note">What it&apos;s for</Label>
        <Input id="iou-note" autoComplete="off" maxLength={120} placeholder="Invoice #1042, logo design" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <PrivateToggle status={status} checked={keepPrivate} onChange={setKeepPrivate} />
      <p className="text-xs text-muted-foreground">
        Posted through Arc&apos;s Memo contract, so the note is stored onchain with the IOU. Settles in the next cycle you can fund, within 7 days.
      </p>
      <Button type="submit" disabled={!valid || busy}>
        Record IOU
      </Button>
    </form>
  );
}

/** What the user owes and is owed across open IOUs, and what to deposit so the next cycle can clear them. */
function NetHint({
  account,
  snapshot,
  bals,
  busy,
  onDeposit,
}: {
  account: Address;
  snapshot: Snapshot;
  bals?: Bal;
  busy: boolean;
  onDeposit: (token: Address, amount: string) => void;
}) {
  const me = account.toLowerCase();
  const rows = snapshot.tokens
    .map((token) => {
      const open = snapshot.ious.filter((i) => i.status === "pending" && i.token.toLowerCase() === token.toLowerCase());
      const owe = open.filter((i) => i.debtor.toLowerCase() === me).reduce((s, i) => s + remainingOf(i), 0n);
      const owed = open.filter((i) => i.creditor.toLowerCase() === me).reduce((s, i) => s + remainingOf(i), 0n);
      const deposit = bals?.find((b) => b.token === token)?.deposit;
      const net = owed - owe;
      const needed = deposit === undefined || net >= 0n ? 0n : -net > deposit ? -net - deposit : 0n;
      return { token, owe, owed, net, deposit, needed };
    })
    .filter((r) => r.owe > 0n || r.owed > 0n);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">You have no open bills, so there&apos;s nothing to fund. Add a bill on the Bills page.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => (
        <div key={r.token} className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            You owe <span className="font-mono text-foreground">{fmtToken(r.owe, r.token)}</span>, you&apos;re owed{" "}
            <span className="font-mono text-foreground">{fmtToken(r.owed, r.token)}</span>.{" "}
            {r.net >= 0n ? (
              <>You&apos;re a net creditor, so there&apos;s nothing to deposit.</>
            ) : r.needed > 0n ? (
              <>
                Your net is <span className="font-mono text-foreground">{fmtToken(-r.net, r.token)}</span>; deposit{" "}
                <span className="font-mono text-foreground">{fmtToken(r.needed, r.token)}</span> more to clear it.
              </>
            ) : (
              <>Your deposit already covers your net of {fmtToken(-r.net, r.token)}.</>
            )}
          </p>
          {r.needed > 0n && (
            <Button className="self-start" disabled={busy} onClick={() => onDeposit(r.token, formatUnits(r.needed, 6))}>
              Deposit {fmtToken(r.needed, r.token)}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function NameRow({ account, busy, onRegister }: { account: Address; busy: boolean; onRegister: (name: string) => void }) {
  const [name, setName] = useState("");
  const id = identities.get(account.toLowerCase());
  if (id) {
    return (
      <p className="flex items-center gap-1.5 text-sm">
        <BadgeCheck className="size-4 text-muted-foreground" aria-hidden />
        Listed as <span className="font-medium">{id.name}</span>
        <span className="text-xs text-muted-foreground">(ERC-8004 #{String(id.agentId)})</span>
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onRegister(name.trim());
      }}
    >
      <Label htmlFor="reg-name">Your name</Label>
      <div className="flex gap-2">
        <Input id="reg-name" autoComplete="organization" maxLength={48} placeholder="Your business or name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="outline" disabled={!name.trim() || busy}>
          Register
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Registers an ERC-8004 identity on Arc so others see your name, not your address.</p>
    </form>
  );
}

/** USDC | EURC toggle with the token marks; same height as the inputs beside it. */
export function TokenSelect({ id, tokens, value, onChange }: { id: string; tokens: Address[]; value: Address; onChange: (t: Address) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-sm font-medium leading-none">
        Token
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="inline-flex h-9 rounded-lg border border-input bg-background p-0.5">
        {tokens.map((t) => {
          const sym = tokenSymbol(t);
          const on = t === value;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(t)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static token mark */}
              <img src={`/logos/${sym.toLowerCase()}.svg`} alt="" className={`size-4 ${on ? "" : "opacity-60"}`} />
              {sym}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function isAmount(v: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(v)) return false;
  return parseUnits(v, 6) > 0n;
}


/** One row per settled IOU: which cycle and transaction discharged which invoice. */
function exportCsv(account: Address, ious: IOURow[], snapshot: Snapshot, keys?: NoteKeys) {
  const txOf = new Map(snapshot.cycles.map((c) => [String(c.cycle), c]));
  const rows = [["direction", "counterparty", "amount", "token", "note", "ref", "cycle", "settled_at", "settlement_tx"]];
  for (const i of ious.filter((x) => x.status === "settled")) {
    const owe = i.debtor.toLowerCase() === account.toLowerCase();
    const c = txOf.get(String(i.cycle));
    rows.push([
      owe ? "payable" : "receivable",
      owe ? i.creditor : i.debtor,
      fmtToken(i.amount, i.token).split(" ")[0]!.replaceAll(",", ""),
      tokenSymbol(i.token),
      (() => {
        const v = readNote(i, account, keys);
        return v.text ?? (v.isPrivate ? "[private note — unlock to export]" : "");
      })(),
      i.ref,
      String(i.cycle),
      c?.timestamp ? fmtDate(c.timestamp) : "",
      c?.tx ?? "",
    ]);
  }
  const csv = rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `setoff-${account.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
