"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, Loader2, LogOut, Wallet } from "lucide-react";
import { labelOf, net } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import type { WalletOption } from "@/lib/wallets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorText } from "@/components/setoff/tx";
import { useApp } from "./state";

const INSTALL = [
  { name: "MetaMask", href: "https://metamask.io/download/" },
  { name: "Rabby", href: "https://rabby.io/" },
  { name: "Coinbase Wallet", href: "https://www.coinbase.com/wallet/downloads" },
];

/** Deterministic two-tone avatar from an address, so each account is recognisable at a glance. */
export function Avatar({ address, size = 24 }: { address: string; size?: number }) {
  const n = parseInt(address.slice(2, 10), 16);
  const h1 = n % 360;
  const h2 = (h1 + 40 + ((n >> 9) % 80)) % 360;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-white/10"
      style={{ width: size, height: size, background: `linear-gradient(135deg, oklch(0.72 0.15 ${h1}), oklch(0.5 0.17 ${h2}))` }}
    />
  );
}

export function WalletButton() {
  const { account, connect, onArc, switchToArc } = useApp();
  if (!account) {
    return (
      <Button onClick={connect}>
        <Wallet aria-hidden /> Connect wallet
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {!onArc && (
        <Button
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={() => switchToArc().catch((e) => toast.error(errorText(e)))}
        >
          <AlertTriangle aria-hidden /> Switch to Arc
        </Button>
      )}
      <AccountMenu />
    </div>
  );
}

function AccountMenu() {
  const { account, wallet, disconnect } = useApp();
  const router = useRouter();
  if (!account) return null;
  const name = labelOf(account)?.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2 pr-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <Avatar address={account} size={22} />
        <span className="max-w-32 truncate">{name ?? <span className="font-mono text-xs">{shortAddr(account)}</span>}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-1.5">
        <div className="flex items-center gap-3 rounded-md p-2.5">
          <Avatar address={account} size={36} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{name ?? "Unnamed account"}</span>
            <span className="font-mono text-xs text-muted-foreground">{shortAddr(account)}</span>
            {wallet && <span className="text-xs text-muted-foreground">via {wallet.name} · {net.name}</span>}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-9"
          onClick={async () => {
            await navigator.clipboard.writeText(account);
            toast.success("Address copied");
          }}
        >
          <Copy aria-hidden /> Copy address
        </DropdownMenuItem>
        {!net.local && (
          <DropdownMenuItem className="h-9" onClick={() => window.open(`${net.explorer}/address/${account}`, "_blank", "noreferrer")}>
            <ExternalLink aria-hidden /> View on explorer
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="h-9" onClick={() => router.push("/app/wallet")}>
          <Wallet aria-hidden /> Deposits and name
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-9"
          variant="destructive"
          onClick={() => {
            disconnect();
            toast("Disconnected");
          }}
        >
          <LogOut aria-hidden /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Phase = { kind: "idle" } | { kind: "connecting"; id: string } | { kind: "error"; id: string; message: string };

export function ConnectDialog() {
  const { connectOpen, setConnectOpen, wallets, walletsReady, connectWith } = useApp();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function pick(option: WalletOption) {
    setPhase({ kind: "connecting", id: option.id });
    try {
      await connectWith(option);
      setPhase({ kind: "idle" });
      setConnectOpen(false);
      toast.success(`Connected with ${option.name}`);
    } catch (e) {
      setPhase({ kind: "error", id: option.id, message: errorText(e) });
    }
  }

  return (
    <Dialog
      open={connectOpen}
      onOpenChange={(open) => {
        setConnectOpen(open);
        if (!open) setPhase({ kind: "idle" });
      }}
    >
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Connect a wallet</DialogTitle>
          <DialogDescription>
            Setoff runs on {net.name}. If your wallet doesn&apos;t have the network yet, it will ask to add it.
          </DialogDescription>
        </DialogHeader>

        <Steps phase={phase} />

        {!walletsReady ? (
          <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Looking for wallets…
          </div>
        ) : wallets.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">No wallet found in this browser</p>
            <p className="text-sm text-muted-foreground">Install one, then reload this page.</p>
            <ul className="flex flex-wrap gap-2">
              {INSTALL.map((i) => (
                <li key={i.name}>
                  <a
                    href={i.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {i.name} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {wallets.map((option) => {
              const busy = phase.kind === "connecting" && phase.id === option.id;
              const failed = phase.kind === "error" && phase.id === option.id;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={phase.kind === "connecting"}
                    onClick={() => pick(option)}
                    className="flex h-14 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 text-left transition-colors hover:border-primary/50 hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {option.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs from the extension
                      <img src={option.icon} alt="" className="size-8 rounded-md" />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-md bg-muted">
                        <Wallet className="size-4" aria-hidden />
                      </span>
                    )}
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm font-medium">{option.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {busy ? `Approve in ${option.name}…` : failed ? "Didn't connect — try again" : "Detected"}
                      </span>
                    </span>
                    {busy ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                    ) : (
                      <span className="size-2 rounded-full bg-primary/70" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {phase.kind === "error" && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {phase.message}
          </p>
        )}

        <p className="text-xs leading-5 text-muted-foreground">
          Your wallet holds your USDC and signs every action. Setoff never sees your keys, and the contract can only move funds for bills you
          approved.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Steps({ phase }: { phase: Phase }) {
  const steps = ["Choose wallet", "Approve connection", `Switch to ${net.name}`];
  const active = phase.kind === "connecting" ? 1 : 0;
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Connection steps">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`grid size-5 place-items-center rounded-full border text-[10px] ${
              i < active ? "border-primary bg-primary text-primary-foreground" : i === active ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {i < active ? <Check className="size-3" aria-hidden /> : i + 1}
          </span>
          <span className={i === active ? "text-foreground" : "text-muted-foreground"}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
