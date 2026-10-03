"use client";

import { useEffect, useState } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import { HandCoins } from "lucide-react";
import type { CreditLineRow } from "@/lib/data";
import { fmtToken } from "@/lib/format";
import * as w from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Party } from "@/components/setoff/party";
import { isAmount, TokenSelect } from "@/components/setoff/account";
import { useTx } from "@/components/setoff/tx";
import { useApp } from "./state";

/** Credit page: grant lines on the left; what you lend and can borrow on the right. */
export function CreditPanel() {
  const { snapshot, account, reload, connect } = useApp();
  const { busy, run } = useTx(reload);
  const [deposits, setDeposits] = useState<Record<string, bigint>>({});

  useEffect(() => {
    let live = true;
    if (account && snapshot)
      w.balances(account, snapshot.tokens)
        .then((b) => live && setDeposits(Object.fromEntries(b.map((x) => [x.token.toLowerCase(), x.deposit]))))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [account, snapshot]);

  if (!snapshot) return null;
  if (!account) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-8">
        <p className="font-medium">Connect a wallet</p>
        <p className="text-sm text-muted-foreground">Grant credit to partners you trust, or see and repay credit you&apos;ve been given.</p>
        <Button onClick={connect}>Connect wallet</Button>
      </div>
    );
  }
  const me = account.toLowerCase();
  const lending = snapshot.creditLines.filter((l) => l.lender.toLowerCase() === me && (l.limit > 0n || l.used > 0n));
  const borrowing = snapshot.creditLines.filter((l) => l.borrower.toLowerCase() === me && (l.limit > 0n || l.used > 0n));
  const usdc = snapshot.tokens[0]!;
  const sum = (xs: CreditLineRow[], f: (l: CreditLineRow) => bigint) => xs.filter((l) => l.token === usdc).reduce((s, l) => s + f(l), 0n);
  const card = "flex flex-col gap-5 rounded-xl border border-border bg-card p-6";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="grant" className={`${card} lg:sticky lg:top-24`}>
        <div className="flex items-center gap-2">
          <HandCoins className="size-4 text-muted-foreground" aria-hidden />
          <h2 id="grant" className="text-base font-medium">
            Grant a credit line
          </h2>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Let a partner you trust overdraw up to a limit. If they&apos;re short in a cycle, the gap is paid from{" "}
          <strong className="font-medium text-foreground">your deposit</strong> and recorded as owed back to you. Set the limit to 0 to stop new
          draws at any time.
        </p>
        <GrantForm account={account} tokens={snapshot.tokens} busy={!!busy} onGrant={(b, t, v) => run("Set credit line", () => w.setCreditLine(account, b, t, v))} />
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">
          The risk is yours: if a borrower never repays, you lose what they drew. No one else in the network is affected, and there&apos;s no
          interest.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {[
            ["You've lent out", fmtToken(sum(lending, (l) => l.used), usdc), `${lending.length} line${lending.length === 1 ? "" : "s"}`],
            ["You owe lenders", fmtToken(sum(borrowing, (l) => l.used), usdc), `${borrowing.length} line${borrowing.length === 1 ? "" : "s"}`],
          ].map(([k, v, sub]) => (
            <div key={k} className="flex flex-col gap-1 bg-card p-5">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-mono text-xl tabular-nums">{v}</dd>
              <dd className="text-xs text-muted-foreground">{sub}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="lend" className={card}>
          <h2 id="lend" className="text-base font-medium">
            You lend
          </h2>
          {lending.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t granted any credit lines.</p>
          ) : (
            <LineList title="" lines={lending} who="borrower">
              {(l) => (
                <Button variant="ghost" size="sm" disabled={!!busy || l.limit === 0n} onClick={() => run("Stop credit line", () => w.setCreditLine(account, l.borrower, l.token, 0n))}>
                  Stop
                </Button>
              )}
            </LineList>
          )}
        </section>

        <section aria-labelledby="borrow" className={card}>
          <h2 id="borrow" className="text-base font-medium">
            You can borrow
          </h2>
          {borrowing.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has granted you credit yet.</p>
          ) : (
            <LineList title="" lines={borrowing} who="lender">
              {(l) => {
                const dep = deposits[l.token.toLowerCase()] ?? 0n;
                const canRepay = l.used < dep ? l.used : dep;
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy || canRepay === 0n}
                    title={l.used > 0n && canRepay === 0n ? "Deposit first to repay" : undefined}
                    onClick={() => run(`Repay ${fmtToken(canRepay, l.token)}`, () => w.repayCredit(account, l.lender, l.token, canRepay))}
                  >
                    {canRepay > 0n ? `Repay ${fmtToken(canRepay, l.token)}` : "Repay"}
                  </Button>
                );
              }}
            </LineList>
          )}
        </section>
      </div>
    </div>
  );
}

function LineList({
  title,
  lines,
  who,
  children,
}: {
  title: string;
  lines: CreditLineRow[];
  who: "lender" | "borrower";
  children: (l: CreditLineRow) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {title && <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {lines.map((l) => (
          <li key={`${l.lender}${l.borrower}${l.token}`} className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <Party address={who === "lender" ? l.lender : l.borrower} />
              {children(l)}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Owed back <span className="font-mono text-foreground">{fmtToken(l.used, l.token)}</span> · limit{" "}
                <span className="font-mono text-foreground">{fmtToken(l.limit, l.token)}</span>
              </span>
              {l.limit === 0n && <span>stopped</span>}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${l.limit === 0n ? 100 : Math.min(100, Number((l.used * 100n) / l.limit))}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GrantForm({
  account,
  tokens,
  busy,
  onGrant,
}: {
  account: Address;
  tokens: Address[];
  busy: boolean;
  onGrant: (borrower: Address, token: Address, limit: bigint) => void;
}) {
  const [borrower, setBorrower] = useState("");
  const [limit, setLimit] = useState("");
  const [token, setToken] = useState<Address>(tokens[0]!);
  const err = borrower && !isAddress(borrower) ? "Enter a valid address" : borrower.toLowerCase() === account.toLowerCase() ? "You can't lend to yourself" : undefined;
  const valid = isAddress(borrower) && !err && isAmount(limit);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onGrant(borrower as Address, token, parseUnits(limit, 6));
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="cl-to">Lend to</Label>
        <Input id="cl-to" autoComplete="off" spellCheck={false} placeholder="0x…" className="font-mono" value={borrower} aria-invalid={!!err} onChange={(e) => setBorrower(e.target.value.trim())} />
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cl-limit">Limit</Label>
          <Input id="cl-limit" inputMode="decimal" autoComplete="off" placeholder="0.00" className="font-mono" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <TokenSelect id="cl-token" tokens={tokens} value={token} onChange={setToken} />
      </div>
      <Button type="submit" variant="outline" disabled={!valid || busy}>
        Set credit line
      </Button>
    </form>
  );
}
