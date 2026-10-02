"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { net, tokenSymbol } from "@/lib/config";
import type { IOURow, Snapshot } from "@/lib/data";
import { fmtDate, fmtToken, shortAddr } from "@/lib/format";
import * as w from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Party } from "./party";
import { Empty } from "./cycles";

type Bal = Awaited<ReturnType<typeof w.balances>>;

export function Account({ snapshot, onChange }: { snapshot: Snapshot; onChange: () => void }) {
  const [account, setAccount] = useState<Address>();
  const [bals, setBals] = useState<Bal>();
  const [busy, setBusy] = useState<string>();

  const refresh = useCallback(async () => {
    if (account) setBals(await w.balances(account, snapshot.tokens));
  }, [account, snapshot.tokens]);
  useEffect(() => {
    // Re-read balances whenever the chain snapshot refreshes.
    let live = true;
    if (account)
      w.balances(account, snapshot.tokens)
        .then((b) => live && setBals(b))
        .catch(() => live && setBals(undefined));
    return () => {
      live = false;
    };
  }, [account, snapshot]);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    const id = toast.loading(`${label}…`);
    try {
      const hash = await fn();
      toast.success(`${label} confirmed`, {
        id,
        action: { label: "View", onClick: () => window.open(`${net.explorer}/tx/${hash}`, "_blank") },
      });
      onChange();
      await refresh();
    } catch (e) {
      toast.error(errorText(e), { id });
    } finally {
      setBusy(undefined);
    }
  }

  if (!account) {
    return (
      <Empty title="Connect a wallet to take part" body={`Deposit, record what you owe, and withdraw what you're owed. Runs on ${net.name}.`}>
        <Button
          className="mt-2"
          onClick={() =>
            w
              .connect()
              .then(setAccount)
              .catch((e) => toast.error(errorText(e)))
          }
        >
          <Wallet aria-hidden /> Connect wallet
        </Button>
      </Empty>
    );
  }

  const mine = (i: IOURow) => [i.debtor, i.creditor].some((a) => a.toLowerCase() === account.toLowerCase());
  const myIous = snapshot.ious.filter(mine);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="bal" className="flex flex-col gap-4 rounded-lg border p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="bal" className="text-base font-medium">
            Your deposits
          </h3>
          <span className="font-mono text-xs text-muted-foreground">{shortAddr(account)}</span>
        </div>
        <ul className="flex flex-col gap-3">
          {(bals ?? snapshot.tokens.map((token) => ({ token, deposit: undefined, wallet: undefined }))).map((b) => (
            <li key={b.token} className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="font-mono text-lg tabular-nums">{b.deposit === undefined ? "…" : fmtToken(b.deposit, b.token)}</span>
                <span className="text-xs text-muted-foreground">
                  in wallet {b.wallet === undefined ? "…" : fmtToken(b.wallet, b.token)}
                </span>
              </div>
              <Button
                variant="outline"
                disabled={!b.deposit || !!busy}
                onClick={() => run(`Withdraw ${tokenSymbol(b.token)}`, () => w.withdraw(account, b.token, b.deposit!))}
              >
                Withdraw all
              </Button>
            </li>
          ))}
        </ul>
        <DepositForm tokens={snapshot.tokens} busy={!!busy} onSubmit={(t, a) => run(`Deposit ${a} ${tokenSymbol(t)}`, () => w.deposit(account, t, a))} />
      </section>

      <section aria-labelledby="rec" className="flex flex-col gap-4 rounded-lg border p-6">
        <h3 id="rec" className="text-base font-medium">
          Record an IOU you owe
        </h3>
        <IOUForm
          account={account}
          tokens={snapshot.tokens}
          busy={!!busy}
          onSubmit={(input) => run("Record IOU", () => w.recordIOU(account, input))}
        />
      </section>

      <section aria-labelledby="mine" className="flex flex-col gap-4 lg:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="mine" className="text-base font-medium">
            Your IOUs
          </h3>
          <Button variant="outline" disabled={!myIous.some((i) => i.status === "settled")} onClick={() => exportCsv(account, myIous, snapshot)}>
            Export reconciliation CSV
          </Button>
        </div>
        {myIous.length === 0 ? (
          <Empty title="Nothing yet" body="IOUs you owe or are owed show up here, with the cycle that settled them." />
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {myIous.map((i) => {
              const owe = i.debtor.toLowerCase() === account.toLowerCase();
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{owe ? "You owe" : "Owes you"}</span>
                    <Party address={owe ? i.creditor : i.debtor} />
                  </div>
                  <span className="font-mono tabular-nums">{fmtToken(i.amount, i.token)}</span>
                  <span className="text-sm text-muted-foreground">
                    {i.status === "settled" ? `Settled in #${String(i.cycle)}` : i.status === "pending" ? "Open" : i.status}
                  </span>
                  {i.status === "pending" && (
                    <Button variant="ghost" disabled={!!busy} onClick={() => run(owe ? "Cancel IOU" : "Reject IOU", () => w.cancel(account, i.id))}>
                      {owe ? "Cancel" : "Reject"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function DepositForm({ tokens, busy, onSubmit }: { tokens: Address[]; busy: boolean; onSubmit: (t: Address, amount: string) => void }) {
  const [token, setToken] = useState<Address>(tokens[0]!);
  const [amount, setAmount] = useState("");
  const valid = isAmount(amount);
  return (
    <form
      className="flex flex-col gap-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(token, amount);
      }}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dep-amount">Deposit amount</Label>
          <Input id="dep-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <TokenSelect id="dep-token" tokens={tokens} value={token} onChange={setToken} />
      </div>
      <p className="text-xs text-muted-foreground">Approve and deposit happen in one transaction via Arc&apos;s Multicall3From.</p>
      <Button type="submit" disabled={!valid || busy}>
        Deposit
      </Button>
    </form>
  );
}

function IOUForm({
  account,
  tokens,
  busy,
  onSubmit,
}: {
  account: Address;
  tokens: Address[];
  busy: boolean;
  onSubmit: (input: { creditor: Address; token: Address; amount: string; days: number; note: string }) => void;
}) {
  const [creditor, setCreditor] = useState("");
  const [token, setToken] = useState<Address>(tokens[0]!);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const creditorError =
    creditor && !isAddress(creditor) ? "Enter a valid address" : creditor.toLowerCase() === account.toLowerCase() ? "You can't owe yourself" : undefined;
  const valid = isAddress(creditor) && !creditorError && isAmount(amount) && note.trim().length > 0;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ creditor: creditor as Address, token, amount, days: 7, note: note.trim() });
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
      <p className="text-xs text-muted-foreground">
        Posted through Arc&apos;s Memo contract, so the note is stored onchain with the IOU. Settles in the next cycle you can fund, within 7 days.
      </p>
      <Button type="submit" disabled={!valid || busy}>
        Record IOU
      </Button>
    </form>
  );
}

function TokenSelect({ id, tokens, value, onChange }: { id: string; tokens: Address[]; value: Address; onChange: (t: Address) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Token</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as Address)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tokens.map((t) => (
          <option key={t} value={t}>
            {tokenSymbol(t)}
          </option>
        ))}
      </select>
    </div>
  );
}

function isAmount(v: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(v)) return false;
  return parseUnits(v, 6) > 0n;
}

function errorText(e: unknown) {
  const err = e as { shortMessage?: string; message?: string; code?: number };
  if (err.code === 4001) return "Request rejected in wallet";
  return err.shortMessage ?? err.message ?? "Something went wrong";
}

/** One row per settled IOU: which cycle and transaction discharged which invoice. */
function exportCsv(account: Address, ious: IOURow[], snapshot: Snapshot) {
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
      i.note ?? "",
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
