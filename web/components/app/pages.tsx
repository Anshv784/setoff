"use client";

import { Suspense } from "react";
import { Overview } from "./overview";
import { Activity } from "./activity";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Account } from "@/components/setoff/account";
import { PageHeader } from "./shell";
import { useApp } from "./state";
import { NetworkView } from "@/components/setoff/network";
import { PrivateNotesCard } from "./notes";
import { FxCard } from "./fx";
import { AgentsPanel } from "./agent-card";
import { CreditPanel } from "./credit";


export function OverviewPage() {
  return <Overview />;
}

export function BillsPage() {
  const { snapshot, account, connect, reload, noteKeys, unlockNotes } = useApp();
  return (
    <>
      <PageHeader title="Bills" description="Send an invoice, record what you owe, and track every bill you're part of." />
      {snapshot ? <Account part="bills" snapshot={snapshot} account={account} onConnect={connect} onChange={reload} noteKeys={noteKeys} onUnlock={() => void unlockNotes()} /> : <Skeleton className="h-96 w-full" />}
    </>
  );
}

export function WalletPage() {
  const { snapshot, account, connect, reload } = useApp();
  return (
    <>
      <PageHeader title="Wallet" description="Your deposits, what you owe and are owed per currency, and your profile." />
      {snapshot ? <Account
          part="wallet"
          snapshot={snapshot}
          account={account}
          onConnect={connect}
          onChange={reload}
        /> : <Skeleton className="h-96 w-full" />}
    </>
  );
}

export function ActivityPage() {
  return (
    <Suspense>
      <Activity />
    </Suspense>
  );
}


export function CreditPage() {
  const { snapshot } = useApp();
  return (
    <>
      <PageHeader title="Credit" description="Lend to partners you trust from your deposit, and repay credit you've been given." />
      {snapshot ? <CreditPanel /> : <Skeleton className="h-96 w-full" />}
    </>
  );
}

export function AgentsPage() {
  return (
    <>
      <PageHeader title="Agents" description="Give an AI agent its own wallet and Setoff tools, within limits you set." />
      <AgentsPanel />
    </>
  );
}

export function NetworkPage() {
  const { snapshot, account } = useApp();
  return (
    <>
      <PageHeader title="Who owes whom" description="Every bill as its own payment, versus only the net through Setoff." />
      {snapshot ? <NetworkView snapshot={snapshot} account={account} /> : <Skeleton className="h-[34rem] w-full" />}
    </>
  );
}

export function SettingsPage() {
  const { snapshot, account, connect, reload, noteKeys, unlockNotes, enableNotes } = useApp();
  const card = "flex flex-col gap-5 rounded-xl border border-border bg-card p-6";
  return (
    <>
      <PageHeader title="Settings" description="Private invoice notes and opt-in USDC ↔ EURC netting." />
      {!snapshot ? (
        <Skeleton className="h-96 w-full" />
      ) : !account ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-8">
          <p className="font-medium">Connect a wallet</p>
          <p className="text-sm text-muted-foreground">Settings are per wallet.</p>
          <Button onClick={connect}>Connect wallet</Button>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className={card}>
            <PrivateNotesCard embedded enabled={!!snapshot.noteKeys[account.toLowerCase()]} unlocked={!!noteKeys} onEnable={enableNotes} onUnlock={unlockNotes} />
          </div>
          <div className={card}>
            <FxCard snapshot={snapshot} account={account} onChange={reload} />
          </div>
        </div>
      )}
    </>
  );
}
