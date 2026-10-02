"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { BILLS, CITIES, FLOWS, GROSS, heroProgress, NET, smooth } from "./story";
import { ArcSection, BuiltOn, Faq, Product, WhoFor } from "./sections";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ExternalLink } from "lucide-react";
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
        <BuiltOn />
        <WhoFor />
        <Product />
        <LiveNumbers />
        <ArcSection />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </SmoothScroll>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    heroProgress.current = v;
    setP(v);
  });

  const settled = smooth(0.45, 0.7, p);
  const bills = Math.round(BILLS.length + (FLOWS.length - BILLS.length) * settled);
  const moved = Math.round(GROSS + (NET - GROSS) * settled);
  const intro = 1 - smooth(0.12, 0.3, p);

  return (
    // Tall section with a pinned viewport: scrolling through it runs one netting cycle on the globe.
    <section ref={ref} className="relative -mt-16 h-[240svh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_55%_at_68%_50%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_70%)]"
        />
        <div className="relative mx-auto grid h-full w-full max-w-6xl items-center gap-8 px-4 pt-16 md:grid-cols-[1fr_1.1fr] md:px-6">
          <div className="relative z-10 flex flex-col items-start gap-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              Live on {net.name}
            </span>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-tight md:text-6xl">
              <span className="block md:whitespace-nowrap">Settle every bill.</span>
              <span className="block text-muted-foreground md:whitespace-nowrap">Move only the net.</span>
            </h1>
            <p className="max-w-md text-lg leading-8 text-muted-foreground">
              Setoff clears what businesses owe each other in one onchain cycle. Debts that cancel out never move — you
              only fund the difference.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/app" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
                Launch app <ArrowRight aria-hidden />
              </Link>
              <Link href="#how" className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5 text-base" })}>
                How it works
              </Link>
            </div>
            <CycleCard bills={bills} moved={moved} settled={settled} />
          </div>
          <div className="absolute inset-0 -z-0 opacity-50 md:relative md:inset-auto md:h-[min(82svh,700px)] md:opacity-100">
            <Globe />
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-xs text-muted-foreground transition-opacity"
          style={{ opacity: intro }}
          aria-hidden
        >
          Scroll to run a cycle
          <span className="h-8 w-px bg-gradient-to-b from-muted-foreground to-transparent" />
        </div>
      </div>
    </section>
  );
}

/** Live readout of the globe: the 18 bills on screen, and what one Setoff cycle reduces them to. */
function CycleCard({ bills, moved, settled }: { bills: number; moved: number; settled: number }) {
  const done = settled > 0.98;
  const phase = done ? 2 : settled > 0.02 ? 1 : 0;
  return (
    <div className="mt-2 flex w-full max-w-md flex-col gap-3">
    <ol className="flex items-center gap-2 text-xs" aria-label="Cycle progress">
      {["Bills", "Netting", "Settled"].map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`grid size-5 place-items-center rounded-full border font-mono text-[10px] transition-colors duration-300 ${
              i < phase ? "border-primary bg-primary text-primary-foreground" : i === phase ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {i + 1}
          </span>
          <span className={i === phase ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          {i < 2 && <span className={`h-px w-6 transition-colors duration-300 ${i < phase ? "bg-primary" : "bg-border"}`} aria-hidden />}
        </li>
      ))}
    </ol>
    <div className="grid w-full grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm" aria-live="polite">
      <div className="flex flex-col gap-1 bg-card/80 p-4 backdrop-blur">
        <span className="text-xs text-muted-foreground">{done ? "Transfers" : "Bills"}</span>
        <span className="font-mono text-2xl tabular-nums">{bills}</span>
      </div>
      <div className="flex flex-col gap-1 bg-card/80 p-4 backdrop-blur">
        <span className="text-xs text-muted-foreground">USDC moved</span>
        <span className={`font-mono text-2xl tabular-nums ${done ? "text-primary" : ""}`}>{moved}</span>
      </div>
      <div className="flex flex-col gap-1 bg-card/80 p-4 backdrop-blur">
        <span className="text-xs text-muted-foreground">Never moved</span>
        <span className="font-mono text-2xl tabular-nums">{Math.round(((GROSS - moved) / GROSS) * 100)}%</span>
      </div>
      <p className="col-span-3 bg-card/80 px-4 py-2.5 text-xs text-muted-foreground backdrop-blur">
        {done
          ? `One cycle settled all ${BILLS.length} bills between ${CITIES.length} cities with ${FLOWS.length} net transfers.`
          : settled > 0.02
            ? "Netting… every bill clears in the same transaction."
            : `${BILLS.length} bills between ${CITIES.length} cities, each paid on its own.`}
      </p>
    </div>
    </div>
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
                <span className="text-4xl font-semibold tracking-tight tabular-nums md:text-5xl">{v}</span>
                <span className="text-sm text-muted-foreground">{l}</span>
              </Reveal>
            ))
          : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}
        <p className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          Read live from the Setoff contract on {net.name}.
          {!net.local && (
            <a
              href={`${net.explorer}/address/${net.setoff}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View the contract <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
      </div>
    </section>
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
