"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { net } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/brand";
import { InvoiceView } from "@/components/setoff/invoice";
import { AppProvider, useApp } from "./state";
import { ConnectDialog, WalletButton } from "./wallet-ui";

export const APP_LINKS = [
  { href: "/app", label: "Overview" },
  { href: "/app/bills", label: "Bills" },
  { href: "/app/wallet", label: "Wallet" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/network", label: "Network" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppNav />
      <ConnectDialog />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 md:px-6">
        <Suspense>
          <InvoiceGate />
        </Suspense>
        <ChainError />
        {children}
      </main>
    </AppProvider>
  );
}

function AppNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b transition-colors ${scrolled ? "border-border bg-background/80 backdrop-blur-xl" : "border-border bg-background"}`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
        <Logo />
        <nav aria-label="App" className="hidden h-full md:block">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            {net.name}
          </Badge>
          <WalletButton />
        </div>
      </div>
      {/* Phones: the same links as a scrollable row. */}
      <nav aria-label="App" className="overflow-x-auto border-t border-border md:hidden">
        <div className="flex h-11 min-w-max px-2">
          <NavLinks pathname={pathname} />
        </div>
      </nav>
    </header>
  );
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <ul className="flex h-full items-stretch">
      {APP_LINKS.map((l) => {
        const active = l.href === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(l.href);
        return (
          <li key={l.href} className="flex">
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
              {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Invoice links (`?invoice=…`) open on whichever app page they point at. */
function InvoiceGate() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { account, connect, reload } = useApp();
  const param = params.get("invoice");
  if (!param) return null;
  return <InvoiceView param={param} account={account} onConnect={connect} onChange={reload} onClose={() => router.replace(pathname)} />;
}

function ChainError() {
  const { error, snapshot, reload } = useApp();
  if (!error || snapshot) return null;
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-6">
      <p className="font-medium">Couldn&apos;t read from {net.name}</p>
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" onClick={reload}>
        Try again
      </Button>
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
