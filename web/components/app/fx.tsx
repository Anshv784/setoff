"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { ArrowLeftRight } from "lucide-react";
import { remainingOf, type Snapshot } from "@/lib/data";
import * as w from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTx } from "@/components/setoff/tx";

const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Opt-in USDC↔EURC conversion of your leftover: if you're owed one currency and owe the
 * other, a cycle can swap the difference with another opted-in party, never below your rate.
 */
export function FxCard({ snapshot, account, onChange }: { snapshot: Snapshot; account: Address; onChange: () => void }) {
  const { busy, run } = useTx(onChange);
  const [usdc, eurc] = snapshot.tokens as [Address, Address];
  const me = account.toLowerCase();
  const pref = (sell: Address, buy: Address) => snapshot.fxPrefs[`${me}:${sell}:${buy}`.toLowerCase()] ?? 0n;
  const [market, setMarket] = useState<number | null>(null);
  const [sell, setSell] = useState<"EURC" | "USDC">("EURC");
  const [slip, setSlip] = useState("0.5");

  useEffect(() => {
    let live = true;
    w.referenceRate().then((r) => live && setMarket(r));
    return () => {
      live = false;
    };
  }, []);

  // Your open leftover per currency (positive = owed to you).
  const net = (t: Address) =>
    snapshot.ious
      .filter((i) => i.status === "pending" && i.token.toLowerCase() === t.toLowerCase())
      .reduce((s, i) => s + (i.creditor.toLowerCase() === me ? remainingOf(i) : i.debtor.toLowerCase() === me ? -remainingOf(i) : 0n), 0n);
  const nu = net(usdc);
  const ne = net(eurc);
  const on = { EURC: pref(eurc, usdc), USDC: pref(usdc, eurc) };
  const [from, to] = sell === "EURC" ? [eurc, usdc] : [usdc, eurc];
  // Rate for the chosen direction (buy per 1 sell), and your floor a little below it.
  const rate = market ? (sell === "EURC" ? market : 1 / market) : null;
  const pct = Number(slip);
  const floor = rate && pct >= 0 && pct < 10 ? rate * (1 - pct / 100) : null;

  let preview = "No leftover to convert right now: you're not owed one currency while owing the other.";
  if (ne > 0n && nu < 0n && market) {
    const eur = ne < (-nu * 1_000_000n) / BigInt(Math.round(market * 1e6)) ? ne : (-nu * 1_000_000n) / BigInt(Math.round(market * 1e6));
    preview = `You're owed ${fmt(ne)} EURC and owe ${fmt(-nu)} USDC. If you opt in to sell EURC, up to ${fmt(eur)} EURC could cover about ${fmt((eur * BigInt(Math.round(market * 1e6))) / 1_000_000n)} USDC of your debt, so you'd deposit less.`;
  } else if (nu > 0n && ne < 0n && market) {
    const eur = -ne < (nu * 1_000_000n) / BigInt(Math.round(market * 1e6)) ? -ne : (nu * 1_000_000n) / BigInt(Math.round(market * 1e6));
    preview = `You're owed ${fmt(nu)} USDC and owe ${fmt(-ne)} EURC. If you opt in to sell USDC, about ${fmt((eur * BigInt(Math.round(market * 1e6))) / 1_000_000n)} USDC could cover up to ${fmt(eur)} EURC of your debt.`;
  }

  return (
    <section aria-labelledby="fx" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="fx" className="inline-flex items-center gap-1.5 text-sm font-medium">
          <ArrowLeftRight className="size-3.5 text-muted-foreground" aria-hidden /> USDC ↔ EURC netting
        </h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${on.EURC || on.USDC ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
          {on.EURC && on.USDC ? "Both ways" : on.EURC ? "Sell EURC" : on.USDC ? "Sell USDC" : "Off"}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Optional. If you&apos;re owed one currency and owe the other, a cycle can swap the difference with another opted-in party instead of
        you depositing it. Never below your minimum rate, and never from your deposit.
      </p>
      <p className="rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">{preview}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fx-sell">I&apos;ll give up</Label>
          <select
            id="fx-sell"
            value={sell}
            onChange={(e) => setSell(e.target.value as "EURC" | "USDC")}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="EURC">EURC for USDC</option>
            <option value="USDC">USDC for EURC</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fx-slip">Max below market (%)</Label>
          <Input id="fx-slip" inputMode="decimal" className="font-mono" value={slip} onChange={(e) => setSlip(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {rate && floor
          ? `Market ${rate.toFixed(4)} ${sell === "EURC" ? "USDC per EURC" : "EURC per USDC"} · your minimum ${floor.toFixed(4)}`
          : "Market rate unavailable right now."}
        {on[sell] > 0n && ` · current minimum ${Number(formatUnits(on[sell], 6)).toFixed(4)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!!busy || !floor}
          onClick={() => run(`Opt in to sell ${sell}`, () => w.setFxPreference(account, from, to, parseUnits(floor!.toFixed(6), 6)))}
        >
          {on[sell] > 0n ? "Update minimum" : `Opt in to sell ${sell}`}
        </Button>
        {on[sell] > 0n && (
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run(`Opt out of selling ${sell}`, () => w.setFxPreference(account, from, to, 0n))}>
            Opt out
          </Button>
        )}
      </div>
    </section>
  );
}
