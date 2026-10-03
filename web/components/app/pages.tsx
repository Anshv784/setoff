"use client";

import { Suspense } from "react";
import { Overview } from "./overview";
import { Activity } from "./activity";

import { Skeleton } from "@/components/ui/skeleton";
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
  const { snapshot, account, connect, reload, noteKeys, unlockNotes, enableNotes } = useApp();
  return (
    <>
      <PageHeader title="Wallet" description="Your deposits, what you owe and are owed per currency, and your settings." />
      {snapshot ? <Account
          part="wallet"
          snapshot={snapshot}
          account={account}
          onConnect={connect}
          onChange={reload}
          settings={
            account
              ? [
                  <PrivateNotesCard
                    key="notes"
                    embedded
                    enabled={!!snapshot.noteKeys[account.toLowerCase()]}
                    unlocked={!!noteKeys}
                    onEnable={enableNotes}
                    onUnlock={unlockNotes}
                  />,
                  <FxCard key="fx" snapshot={snapshot} account={account} onChange={reload} />,
                ]
              : undefined
          }
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
