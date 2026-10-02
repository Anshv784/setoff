"use client";

import { Suspense } from "react";
import { Overview } from "./overview";
import { Activity } from "./activity";

import { Skeleton } from "@/components/ui/skeleton";
import { Account } from "@/components/setoff/account";
import { NetworkView } from "@/components/setoff/network";
import { PageHeader } from "./shell";
import { useApp } from "./state";
import { PrivateNotesCard } from "./notes";


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
      <PageHeader title="Wallet" description="Your deposits, your net for the next cycle, and your name on Arc." />
      {snapshot ? <Account
          part="wallet"
          snapshot={snapshot}
          account={account}
          onConnect={connect}
          onChange={reload}
          aside={
            account && (
              <PrivateNotesCard
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

export function NetworkPage() {
  const { snapshot, account } = useApp();
  return (
    <>
      <PageHeader title="Who owes whom" description="Every bill as its own payment, versus only the net through Setoff." />
      {snapshot ? <NetworkView snapshot={snapshot} account={account} /> : <Skeleton className="h-[34rem] w-full" />}
    </>
  );
}
