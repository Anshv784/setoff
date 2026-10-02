"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileSignature, Layers, Wallet } from "lucide-react";
import { net } from "@/lib/config";
import { loadSnapshot, savedBps, totals } from "@/lib/data";
import { fmtAmount, fmtPct } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { Reveal, SmoothScroll } from "@/components/site/motion";
import { REPO } from "@/components/site/brand";

const Globe = dynamic(() => import("./globe"), { ssr: false });

export function Landing() {
  return (
    <SmoothScroll>
      <SiteNav />
      <main>
        <Hero />
        <Idea />
        <Steps />
        <LiveNumbers />
        <Arc />
        <Cta />
      </main>
      <SiteFooter />
    </SmoothScroll>
  );
}

function Hero() {
  return (
    <section className="relative -mt-16 overflow-hidden">
      {/* Soft accent wash behind the globe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_45%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]"
      />
      <div className="relative mx-auto grid min-h-[100svh] w-full max-w-6xl items-center gap-8 px-4 pt-24 pb-16 md:grid-cols-[1.05fr_1fr] md:px-6">
        <div className="relative z-10 flex flex-col items-start gap-7">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              Live on {net.name}
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-tight md:text-6xl">
              <span className="block md:whitespace-nowrap">Settle every bill.</span>
              <span className="block text-muted-foreground md:whitespace-nowrap">Move only the net.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-md text-lg leading-8 text-muted-foreground">
              Setoff clears what businesses owe each other in one onchain cycle. Debts that cancel out never move — you
              only fund the difference.
            </p>
          </Reveal>
          <Reveal delay={0.15} className="flex flex-wrap gap-3">
            <Link href="/app" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
              Launch app <ArrowRight aria-hidden />
            </Link>
            <Link href="#how" className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5 text-base" })}>
              How it works
            </Link>
          </Reveal>
        </div>
        <div className="absolute inset-x-0 top-24 -z-0 h-[70vh] opacity-60 md:relative md:inset-auto md:top-auto md:h-[min(80vh,640px)] md:opacity-100">
          <Globe />
        </div>
      </div>
    </section>
  );
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 md:px-6 md:py-28">
      <Reveal className="mb-12 flex max-w-2xl flex-col gap-3">
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}

function Idea() {
  const bills = [
    ["Studio", "Agency", "10"],
    ["Agency", "Printer", "9"],
    ["Printer", "Studio", "8"],
  ];
  return (
    <Section eyebrow="The idea" title="Most of what businesses owe each other cancels out.">
      <div className="grid gap-4 md:grid-cols-2">
        <Reveal className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-8">
          <p className="text-sm text-muted-foreground">Paid one by one</p>
          <ul className="flex flex-col gap-3">
            {bills.map(([from, to, amt]) => (
              <li key={from} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
                <span>
                  {from} <span className="text-muted-foreground">→</span> {to}
                </span>
                <span className="font-mono tabular-nums">{amt} USDC</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto font-mono text-3xl tabular-nums">
            27 <span className="font-sans text-base text-muted-foreground">USDC moved · 3 payments</span>
          </p>
        </Reveal>
        <Reveal delay={0.1} className="flex flex-col gap-6 rounded-2xl border border-primary/40 bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] p-8">
          <p className="text-sm text-muted-foreground">Through Setoff</p>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-primary/40 px-4 py-3">
              <span>
                Studio <span className="text-muted-foreground">funds its net</span>
              </span>
              <span className="font-mono tabular-nums">2 USDC</span>
            </div>
            <p className="px-1 leading-6 text-muted-foreground">
              All three bills are discharged in the same transaction. Agency and Printer are each left 1 USDC ahead.
            </p>
          </div>
          <p className="mt-auto font-mono text-3xl tabular-nums text-primary">
            2 <span className="font-sans text-base text-muted-foreground">USDC moved · 1 cycle</span>
          </p>
        </Reveal>
      </div>
    </Section>
  );
}

function Steps() {
  const steps = [
    {
      icon: FileSignature,
      title: "Send an invoice",
      body: "Bill anyone with a link. They approve it with a free signature — no gas, no setup.",
    },
    {
      icon: Wallet,
      title: "Fund only your net",
      body: "Owe 10 and owed 8? Deposit 2. Setoff tells you the exact amount.",
    },
    {
      icon: Layers,
      title: "One cycle settles all",
      body: "Every bill clears at once. The contract checks every position; nobody can move your money.",
    },
  ];
  return (
    <Section id="how" eyebrow="How it works" title="Three steps. No intermediaries.">
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08}>
            <li className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-8">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="text-xl font-medium">{s.title}</h3>
              <p className="leading-7 text-muted-foreground">{s.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

function LiveNumbers() {
  const [data, setData] = useState<{ pct: string; cleared: string; moved: string; cycles: number } | null>();
  useEffect(() => {
    loadSnapshot()
      .then((s) => {
        const t = totals(s);
        const g = Object.values(t.gross).reduce((a, b) => a + b, 0n);
        const n = Object.values(t.netFunded).reduce((a, b) => a + b, 0n);
        setData({ pct: fmtPct(savedBps(g, n)), cleared: fmtAmount(g), moved: fmtAmount(n), cycles: s.cycles.length });
      })
      .catch(() => setData(null));
  }, []);
  if (data === null) return null;
  const stats = data
    ? [
        [data.pct, "never had to move"],
        [data.cleared, "USDC of bills cleared"],
        [data.moved, "USDC actually moved"],
        [String(data.cycles), "cycles settled"],
      ]
    : undefined;
  return (
    <section aria-label="Live numbers" className="border-y border-border bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-4 py-16 md:grid-cols-4 md:px-6">
        {stats
          ? stats.map(([v, l], i) => (
              <Reveal key={l} delay={i * 0.06} className="flex flex-col gap-2">
                <span className="font-mono text-4xl tabular-nums md:text-5xl">{v}</span>
                <span className="text-sm text-muted-foreground">{l}</span>
              </Reveal>
            ))
          : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}
        <p className="col-span-full text-xs text-muted-foreground">Read live from the Setoff contract on {net.name}.</p>
      </div>
    </section>
  );
}

function Arc() {
  const items = [
    ["USDC as gas", "One asset for fees and settlement. A full cycle costs about a cent."],
    ["Final in under a second", "Cycles clear in minutes, not days, and are final once included."],
    ["Memo", "Invoice notes and cycle summaries are recorded onchain with every transaction."],
    ["ERC-8004 identity", "Counterparties show up by name, verified against Arc's identity registry."],
  ];
  return (
    <Section id="arc" eyebrow="Built on Arc" title="A clearinghouse that only makes sense on a stablecoin chain.">
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
        {items.map(([t, b], i) => (
          <Reveal key={t} delay={i * 0.05} className="flex flex-col gap-2 bg-background p-8">
            <h3 className="text-lg font-medium">{t}</h3>
            <p className="leading-7 text-muted-foreground">{b}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Cta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-24 md:px-6 md:pb-32">
      <Reveal className="relative overflow-hidden rounded-3xl border border-border bg-card px-8 py-16 text-center md:px-16 md:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_100%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_70%)]"
        />
        <div className="relative flex flex-col items-center gap-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-5xl">Stop moving money that cancels out.</h2>
          <p className="max-w-md text-muted-foreground">Open the app, send your first invoice, and watch the next cycle clear it.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/app" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
              Launch app <ArrowRight aria-hidden />
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5 text-base" })}>
              Read the code <ArrowUpRight aria-hidden />
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
