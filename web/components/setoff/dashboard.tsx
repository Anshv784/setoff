"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { toast } from "sonner";
import { connect } from "@/lib/wallet";
import { InvoiceView } from "./invoice";
import { errorText } from "./tx";
import { net } from "@/lib/config";
import { loadSnapshot, type Snapshot } from "@/lib/data";
import { shortAddr } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stats, StatsSkeleton } from "./stats";
import { Cycles } from "./cycles";
import { Pool } from "./pool";
import { Account } from "./account";
import { HowItWorks } from "./how-it-works";
import { NetworkView } from "./network";

const REFRESH_MS = 20_000;
export const REPO = "https://github.com/Anshv784/setoff";

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [account, setAccount] = useState<Address>();
  const [closed, setClosed] = useState(false);
  // Read ?invoice= from the URL; empty during the static prerender.
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => "",
  );
  const invoiceParam = closed ? null : new URLSearchParams(search).get("invoice");

  const onConnect = useCallback(() => {
    connect()
      .then(setAccount)
      .catch((e) => toast.error(errorText(e)));
  }, []);

  const closeInvoice = useCallback(() => {
    window.history.replaceState(null, "", window.location.pathname);
    setClosed(true);
  }, []);

  const load = useCallback(() => {
    loadSnapshot()
      .then((s) => {
        setSnapshot(s);
        setError(undefined);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const open = snapshot?.ious.filter((i) => i.status === "pending").length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">Setoff</span>
          <Badge variant="outline">{net.name}</Badge>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          {net.local ? (
            <span className={buttonVariants({ variant: "ghost" })}>
              Contract <span className="font-mono text-xs text-muted-foreground">{shortAddr(net.setoff)}</span>
            </span>
          ) : (
            <a className={buttonVariants({ variant: "ghost" })} href={`${net.explorer}/address/${net.setoff}`} target="_blank" rel="noreferrer">
              Contract <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{shortAddr(net.setoff)}</span>
            </a>
          )}
          <a className={buttonVariants({ variant: "ghost" })} href={REPO} target="_blank" rel="noreferrer">
            Source
          </a>
        </nav>
      </header>

      <main className="flex flex-col gap-16">
        {invoiceParam && (
          <InvoiceView param={invoiceParam} account={account} onConnect={onConnect} onChange={load} onClose={closeInvoice} />
        )}

        {error && !snapshot ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-6">
            <p className="font-medium">Couldn&apos;t read from {net.name}</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        ) : snapshot ? (
          <Stats snapshot={snapshot} />
        ) : (
          <StatsSkeleton />
        )}

        <section aria-labelledby="graph" className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 id="graph" className="text-xl font-semibold">
              Who owes whom
            </h2>
            <p className="text-sm text-muted-foreground">Every bill as its own payment, versus only the net through Setoff.</p>
          </div>
          {snapshot ? <NetworkView snapshot={snapshot} /> : <Skeleton className="h-96 w-full" />}
        </section>

        <HowItWorks />

        <section aria-labelledby="activity" className="flex flex-col gap-6">
          <h2 id="activity" className="text-xl font-semibold">
            Activity
          </h2>
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
            <Skeleton className="h-64 w-full" />
          )}
        </section>

        <section aria-labelledby="take-part" className="flex flex-col gap-6">
          <h2 id="take-part" className="text-xl font-semibold">
            Take part
          </h2>
          {snapshot ? <Account snapshot={snapshot} account={account} onConnect={onConnect} onChange={load} /> : <Skeleton className="h-48 w-full" />}
        </section>
      </main>

      <footer className="flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground">
        <p>
          Demo participants are wallets run by the builder to show the flow; their roles are labels, not real businesses. Anyone can
          connect a wallet and take part.
        </p>
        <p>Open source, MIT. Unaudited; use small amounts.</p>
      </footer>
    </div>
  );
}
