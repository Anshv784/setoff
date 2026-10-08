"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Bot, Code2, Ellipsis, HandCoins, History, LayoutGrid, Receipt, Wallet, Waypoints } from "lucide-react";
import { net } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Logo, REPO } from "@/components/site/brand";
import { InvoiceView } from "@/components/setoff/invoice";
import { AppProvider, useApp } from "./state";
import { InboxBadge, InboxNotifier } from "./inbox";
import { ConnectDialog, WalletButton } from "./wallet-ui";

export const APP_LINKS = [
  { href: "/app", label: "Overview", icon: LayoutGrid, group: "main" },
  { href: "/app/bills", label: "Bills", icon: Receipt, group: "main" },
  { href: "/app/wallet", label: "Wallet", icon: Wallet, group: "main" },
  { href: "/app/credit", label: "Credit", icon: HandCoins, group: "main" },
  { href: "/app/network", label: "Network", icon: Waypoints, group: "tools" },
  { href: "/app/activity", label: "Activity", icon: History, group: "tools" },
  { href: "/app/agents", label: "Agents", icon: Bot, group: "tools" },
] as const;

const isActive = (pathname: string, href: string) => (href === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(href));

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppNav />
      <ConnectDialog />
      <InboxNotifier />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-6 pb-28 md:gap-10 md:px-6 md:py-10">
        <Suspense>
          <InvoiceGate />
        </Suspense>
        <ChainError />
        {children}
      </main>
      <MobileTabBar />
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
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 md:px-6">
        <Logo />
        <nav aria-label="App" className="hidden md:block">
          <NavBar pathname={pathname} />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center rounded-full border border-border bg-card/60 p-0.5 lg:flex">
            <Link
              href="/docs"
              aria-label="Docs"
              title="Docs"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BookOpen className="size-4" aria-hidden />
            </Link>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              aria-label="Source code"
              title="Source code"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Code2 className="size-4" aria-hidden />
            </a>
          </div>
          <span className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 text-xs text-muted-foreground sm:inline-flex">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            {net.name}
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

/** Main pages as labelled pills; Network, Activity and Agents as a compact icon group. */
function NavBar({ pathname }: { pathname: string }) {
  const main = APP_LINKS.filter((l) => l.group === "main");
  const tools = APP_LINKS.filter((l) => l.group === "tools");
  const pill = (active: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
      {main.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={`${pill(active)} px-3`}>
            <l.icon className={`size-4 ${active ? "text-primary" : ""}`} aria-hidden />
            {l.label}
            {l.href === "/app/bills" && <InboxBadge />}
          </Link>
        );
      })}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {tools.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            aria-label={l.label}
            title={l.label}
            className={`${pill(active)} px-2 2xl:px-3`}
          >
            <l.icon className={`size-4 ${active ? "text-primary" : ""}`} aria-hidden />
            <span className={active ? "inline" : "hidden 2xl:inline"}>{l.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Invoice links (`?invoice=…`) open on whichever app page they point at. */
function InvoiceGate() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { account, connect, reload, snapshot } = useApp();
  const param = params.get("invoice");
  if (!param) return null;
  return <InvoiceView param={param} snapshot={snapshot} account={account} onConnect={connect} onChange={reload} onClose={() => router.replace(pathname)} />;
}

function ChainError() {
  const { error, snapshot, reload } = useApp();
  if (!error || snapshot) return null;
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-6">
      <p className="font-medium">Couldn&apos;t reach {net.name}</p>
      <p className="text-sm text-muted-foreground">
        The network didn&apos;t answer after a few tries. It&apos;s usually a brief hiccup, or a browser extension blocking requests to{" "}
        <span className="font-mono">{new URL(net.rpc).host}</span>.
      </p>
      <details className="max-w-full text-xs text-muted-foreground">
        <summary className="cursor-pointer">Details</summary>
        <p className="mt-2 break-all font-mono">{error}</p>
      </details>
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

/** Phones: a bottom tab bar like a native app. Main pages as tabs; the rest under "More". */
function MobileTabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const main = APP_LINKS.filter((l) => l.group === "main");
  const more = APP_LINKS.filter((l) => l.group === "tools");
  const moreActive = more.some((l) => isActive(pathname, l.href));
  const tab = (active: boolean) =>
    `relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "text-foreground" : "text-muted-foreground"
    }`;
  return (
    <>
      {open && <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />}
      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 backdrop-blur-xl md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {open && (
          <div className="absolute inset-x-3 bottom-full mb-3 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {[...more.map((l) => ({ href: l.href, label: l.label, icon: l.icon, ext: false })), { href: "/docs", label: "Docs", icon: BookOpen, ext: false }, { href: REPO, label: "Source code", icon: Code2, ext: true }].map((l) =>
              l.ext ? (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="flex h-12 items-center gap-3 border-b border-border px-4 text-sm last:border-0">
                  <l.icon className="size-4 text-muted-foreground" aria-hidden /> {l.label}
                </a>
              ) : (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} aria-current={isActive(pathname, l.href) ? "page" : undefined} className={`flex h-12 items-center gap-3 border-b border-border px-4 text-sm last:border-0 ${isActive(pathname, l.href) ? "text-primary" : ""}`}>
                  <l.icon className="size-4 text-muted-foreground" aria-hidden /> {l.label}
                </Link>
              ),
            )}
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-md items-stretch gap-1 px-2 py-1.5">
          {main.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={tab(active)}>
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-primary/15 text-primary" : ""}`}>
                  <l.icon className="size-[18px]" aria-hidden />
                </span>
                {l.label}
                {l.href === "/app/bills" && <span className="absolute right-[18%] top-0.5"><InboxBadge /></span>}
              </Link>
            );
          })}
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={tab(open || moreActive)}>
            <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${open || moreActive ? "bg-primary/15 text-primary" : ""}`}>
              <Ellipsis className="size-[18px]" aria-hidden />
            </span>
            More
          </button>
        </div>
      </nav>
    </>
  );
}
