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

/** Wallet page: credit lines you grant and credit you can draw. */
export function CreditLinesCard() {
  const { snapshot, account, reload } = useApp();
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

  if (!snapshot || !account) return null;
  const me = account.toLowerCase();
  const lending = snapshot.creditLines.filter((l) => l.lender.toLowerCase() === me && (l.limit > 0n || l.used > 0n));
  const borrowing = snapshot.creditLines.filter((l) => l.borrower.toLowerCase() === me && (l.limit > 0n || l.used > 0n));

  return (
    <section aria-labelledby="credit" className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <HandCoins className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="credit" className="text-base font-medium">
          Credit lines
        </h2>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Let a partner you trust overdraw up to a limit. If they&apos;re short in a cycle, the gap is paid from <strong className="font-medium text-foreground">your deposit</strong>{" "}
        and recorded as owed back to you. If they never repay, you lose what they drew.
      </p>

      <GrantForm account={account} tokens={snapshot.tokens} busy={!!busy} onGrant={(b, t, v) => run("Set credit line", () => w.setCreditLine(account, b, t, v))} />

      {lending.length > 0 && (
        <LineList title="You lend" lines={lending} who="borrower">
          {(l) => (
            <Button variant="ghost" size="sm" disabled={!!busy || l.limit === 0n} onClick={() => run("Stop credit line", () => w.setCreditLine(account, l.borrower, l.token, 0n))}>
              Stop
            </Button>
          )}
        </LineList>
      )}

      {borrowing.length > 0 && (
        <LineList title="You can borrow" lines={borrowing} who="lender">
          {(l) => {
            const canRepay = l.used < (deposits[l.token.toLowerCase()] ?? 0n) ? l.used : (deposits[l.token.toLowerCase()] ?? 0n);
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
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
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
