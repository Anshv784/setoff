"use client";

import { Suspense } from "react";
import { Overview } from "./overview";
import { Activity } from "./activity";

import { Skeleton } from "@/components/ui/skeleton";
import { Account } from "@/components/setoff/account";
import { PageHeader } from "./shell";
import { useApp } from "./state";
import { PrivateNotesCard } from "./notes";
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
      <PageHeader title="Wallet" description="Your deposits, what to fund for the next cycle, and your profile." />
      {snapshot ? <Account
          part="wallet"
          snapshot={snapshot}
          account={account}
          onConnect={connect}
          onChange={reload}
          aside={
            account && (
              <PrivateNotesCard
                embedded
                enabled={!!snapshot.noteKeys[account.toLowerCase()]}
                unlocked={!!noteKeys}
                onEnable={enableNotes}
                onUnlock={unlockNotes}
              />
            )
          }
        /> : <Skeleton className="h-96 w-full max-w-2xl" />}
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
