"use client";

import Link from "next/link";
import { ArrowRight, FileSignature, Share2, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stats, StatsSkeleton } from "@/components/setoff/stats";
import { Cycles } from "@/components/setoff/cycles";
import { Pool } from "@/components/setoff/pool";
import { Account } from "@/components/setoff/account";
import { NetworkView } from "@/components/setoff/network";
import { PageHeader } from "./shell";
import { useApp } from "./state";

const DEMO_NOTE = (
  <p className="text-xs text-muted-foreground">
    Demo participants are wallets run by the builder to show the flow; their names say &quot;(demo)&quot; and are roles, not real
    businesses.
  </p>
);

export function OverviewPage() {
  const { snapshot } = useApp();
  const shortcuts = [
    { href: "/app/bills", icon: FileSignature, title: "Send an invoice", body: "Bill someone with a link they approve for free." },
    { href: "/app/wallet", icon: Wallet, title: "Fund your net", body: "See exactly what to deposit for the next cycle." },
    { href: "/app/network", icon: Share2, title: "See who owes whom", body: "Every bill vs. only the net, drawn out." },
  ];
  return (
    <>
      {snapshot ? <Stats snapshot={snapshot} /> : <StatsSkeleton />}
      <ul className="grid gap-4 md:grid-cols-3">
        {shortcuts.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="flex items-center gap-1 font-medium">
                {s.title}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="text-sm text-muted-foreground">{s.body}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="recent" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="recent" className="text-lg font-semibold">
            Recent cycles
          </h2>
          <Link href="/app/activity" className="rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View all activity
          </Link>
        </div>
        {snapshot ? <Cycles snapshot={snapshot} limit={5} /> : <Skeleton className="h-48 w-full" />}
      </section>
      {DEMO_NOTE}
    </>
  );
}

export function BillsPage() {
  const { snapshot, account, connect, reload } = useApp();
  return (
    <>
      <PageHeader title="Bills" description="Send an invoice, record what you owe, and track every bill you're part of." />
      {snapshot ? <Account part="bills" snapshot={snapshot} account={account} onConnect={connect} onChange={reload} /> : <Skeleton className="h-96 w-full" />}
    </>
  );
}

export function WalletPage() {
  const { snapshot, account, connect, reload } = useApp();
  return (
    <>
      <PageHeader title="Wallet" description="Your deposits, your net for the next cycle, and your name on Arc." />
      {snapshot ? <Account part="wallet" snapshot={snapshot} account={account} onConnect={connect} onChange={reload} /> : <Skeleton className="h-96 w-full max-w-2xl" />}
    </>
  );
}

export function ActivityPage() {
  const { snapshot } = useApp();
  const open = snapshot?.ious.filter((i) => i.status === "pending").length ?? 0;
  return (
    <>
      <PageHeader title="Activity" description="Every cycle and every IOU, read live from the contract." />
      {snapshot ? (
        <Tabs defaultValue="cycles">
          <TabsList>
            <TabsTrigger value="cycles">Cycles ({snapshot.cycles.length})</TabsTrigger>
            <TabsTrigger value="open">Open IOUs ({open})</TabsTrigger>
            <TabsTrigger value="all">All IOUs ({snapshot.ious.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="cycles" className="pt-4">
            <Cycles snapshot={snapshot} />
          </TabsContent>
          <TabsContent value="open" className="pt-4">
            <Pool snapshot={snapshot} filter={(i) => i.status === "pending"} />
          </TabsContent>
          <TabsContent value="all" className="pt-4">
            <Pool snapshot={snapshot} />
          </TabsContent>
        </Tabs>
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
      {DEMO_NOTE}
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
