"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, Wallet } from "lucide-react";
import { Reveal } from "@/components/site/motion";

/* ---------------------------------------------------------------- built on */

export function BuiltOn() {
  return (
    <section aria-label="Built on" className="border-y border-border bg-card/30">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4 py-6 md:gap-x-14 md:py-8 md:px-6">
        <span className="w-full text-center text-xs uppercase tracking-[0.18em] text-muted-foreground md:w-auto">Built on</span>
        {/* eslint-disable @next/next/no-img-element -- static SVG brand marks, no optimisation needed */}
        <a href="https://arc.io" target="_blank" rel="noreferrer" className="opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <img src="/logos/arc.svg" alt="Arc" className="h-6 w-auto md:h-7" />
        </a>
        {[
          ["usdc", "USDC", "https://www.circle.com/usdc"],
          ["eurc", "EURC", "https://www.circle.com/eurc"],
        ].map(([file, name, href]) => (
          <a
            key={file}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm text-base font-semibold md:text-lg tracking-tight text-foreground opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src={`/logos/${file}.svg`} alt="" className="size-6 md:size-8" />
            {name}
          </a>
        ))}
        {/* eslint-enable @next/next/no-img-element */}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- shared */

function Heading({ eyebrow, title, lead, center }: { eyebrow: string; title: string; lead?: string; center?: boolean }) {
  return (
    <Reveal className={`flex max-w-2xl flex-col gap-4 ${center ? "mx-auto items-center text-center" : ""}`}>
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">{title}</h2>
      {lead && <p className="text-base leading-7 text-muted-foreground md:text-lg md:leading-8">{lead}</p>}
    </Reveal>
  );
}

/* ---------------------------------------------------------------- who for */

export function WhoFor() {
  const items = [
    { fact: "12 → 1", caption: "invoices a month, one settlement", title: "Supplier networks", body: "Businesses that buy from and sell to each other every month." },
    { fact: "10 − 8 = 2", caption: "owe 10, owed 8, pay 2", title: "Agencies & freelancers", body: "Studios that subcontract each other and settle up constantly." },
    { fact: "$ · €", caption: "USDC and EURC, each netted", title: "Cross-border teams", body: "Partners billing in both currencies, paying only the net." },
    { fact: "900 → 1", caption: "calls a day, one settlement", title: "AI agents", body: "Software that buys services from other software, all day long.", href: "#agents" },
  ];
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-28">
      <Heading eyebrow="Who it's for" title="Anyone who owes and is owed by the same people." />
      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal key={it.title} delay={i * 0.06} className="bg-card">
            <li className="group flex h-full flex-col gap-4 p-7 transition-colors hover:bg-muted/40">
              <div className="flex flex-col gap-1 border-b border-border pb-5">
                <span className="text-3xl font-semibold tracking-tight text-primary tabular-nums">{it.fact}</span>
                <span className="text-xs text-muted-foreground">{it.caption}</span>
              </div>
              <h3 className="text-lg font-medium">{it.title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{it.body}</p>
              {it.href && (
                <a
                  href={it.href}
                  className="mt-auto inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Connect an agent <ArrowRight className="size-3.5" aria-hidden />
                </a>
              )}
            </li>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------- product */

/** Frame that makes a UI preview read as "this is the app". */
function Window({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-8 inset-x-0 md:-inset-8 rounded-[2rem] bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]"
      />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="ml-3 truncate rounded-md bg-muted px-3 py-1 font-mono text-[11px] text-muted-foreground">{title}</span>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function InvoicePreview() {
  return (
    <Window title="setoff · invoice">
      <div className="flex flex-col gap-5" aria-hidden>
        <div className="flex items-start justify-between gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Invoice from</span>
            <span className="inline-flex items-center gap-1">
              Harbor Design Co. <BadgeCheck className="size-3.5 text-muted-foreground" />
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">Billed to</span>
            <span className="inline-flex items-center gap-1">
              You <BadgeCheck className="size-3.5 text-muted-foreground" />
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-4xl tabular-nums">240.00 USDC</span>
          <span className="text-sm text-muted-foreground">Invoice #1042 · brand refresh</span>
        </div>
        <span className="inline-flex w-fit rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">Awaiting approval</span>
        <div className="flex flex-col gap-2">
          <span className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            <Check className="size-4" /> Approve invoice
          </span>
          <span className="text-xs text-muted-foreground">A free signature — no gas, no USDC needed.</span>
        </div>
      </div>
    </Window>
  );
}

function NetPreview() {
  return (
    <Window title="setoff · wallet">
      <div className="flex flex-col gap-5" aria-hidden>
        <p className="font-medium">For the next cycle</p>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
          {[
            ["You owe", "1,000.00"],
            ["Owed to you", "800.00"],
            ["Your net", "−200.00"],
          ].map(([k, v], i) => (
            <div key={k} className="flex flex-col gap-1 bg-card p-3">
              <span className="text-xs text-muted-foreground">{k}</span>
              <span className={`font-mono tabular-nums ${i === 2 ? "text-primary" : ""}`}>{v}</span>
            </div>
          ))}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Your net is <span className="font-mono text-foreground">200.00 USDC</span>. Deposit that, and all of your bills clear in the next cycle.
        </p>
        <span className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Wallet className="size-4" /> Deposit 200.00 USDC
        </span>
      </div>
    </Window>
  );
}

function CyclePreview() {
  const rows = [
    ["#42", "38 bills", "3,960.00", "214.50", 5.4],
    ["#41", "25 bills", "2,135.00", "788.00", 36.9],
    ["#40", "31 bills", "2,410.00", "301.20", 12.5],
  ] as const;
  return (
    <Window title="setoff · activity">
      <ul className="flex flex-col gap-4" aria-hidden>
        {rows.map(([n, bills, owed, moved, pct], i) => (
          <li key={n} className={`flex flex-col gap-2 rounded-xl border p-4 ${i === 0 ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-mono">{n}</span>
              <span className="text-xs text-muted-foreground">
                {bills} · <span className="font-mono text-foreground">{owed}</span> owed · <span className="font-mono text-foreground">{moved}</span> moved
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Window>
  );
}

export function Product() {
  const steps = [
    {
      n: "01",
      title: "Bill anyone. It lands in their app.",
      body: "Fill in who owes you, how much and what for. It shows up in their Setoff app, or send the link. They approve it with one free signature — no gas, no account.",
      points: ["USDC or EURC", "Invoice note stored onchain", "Either side can cancel"],
      preview: <InvoicePreview />,
    },
    {
      n: "02",
      title: "Fund only what you actually owe.",
      body: "Setoff adds up everything you owe and everything you're owed, and tells you the one number to deposit. Owe 1,000 and owed 800? Deposit 200.",
      points: ["One-click deposit", "Opt-in USDC ↔ EURC netting", "Partners can extend you credit"],
      preview: <NetPreview />,
    },
    {
      n: "03",
      title: "One cycle settles everything.",
      body: "Every bill in the cycle clears in a single transaction. The contract checks every position itself, and if anyone is short, nothing moves at all.",
      points: ["Final in under a second", "Pays in parts when you're short", "Dispute anything before it settles"],
      preview: <CyclePreview />,
    },
  ];
  return (
    <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 md:px-6 md:py-28">
      <Heading eyebrow="How it works" title="Three steps, all in one app." center />
      <div className="mt-12 flex flex-col gap-16 md:mt-20 md:gap-28">
        {steps.map((s, i) => (
          <div key={s.n} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
            <Reveal className={`flex flex-col gap-6 ${i % 2 ? "lg:order-2" : ""}`}>
              <div className="flex items-center gap-4">
                <span className="font-mono text-5xl font-light tracking-tight text-primary">{s.n}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden />
              </div>
              <h3 className="text-3xl font-semibold tracking-tight text-balance">{s.title}</h3>
              <p className="max-w-md text-base leading-7 text-muted-foreground md:text-lg md:leading-8">{s.body}</p>
              <ul className="flex flex-col gap-2.5">
                {s.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-sm">
                    <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-3" aria-hidden />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1} className={i % 2 ? "lg:order-1" : ""}>
              {s.preview}
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- arc */

export function ArcSection() {
  const items = [
    { fact: "$0.02", unit: "per cycle", title: "Gas paid in USDC", body: "One asset for fees and settlement. No second token to buy." },
    { fact: "<1s", unit: "to final", title: "Final in under a second", body: "Cycles can run every few minutes, and money is yours the moment it settles." },
    { fact: "INV-1042", unit: "memo", mono: true, title: "Notes on every payment", body: "Invoice text and cycle summaries are recorded onchain with Arc's Memo." },
    { fact: "Harbor ✓", unit: "not 0x4365…", title: "Names, not addresses", body: "Counterparties show up by name, verified against Arc's identity registry." },
    { fact: "0", unit: "transfers in settle", title: "Never stuck on one wallet", body: "Settlement never sends tokens, so a frozen address can't hold up anyone else." },
  ];
  return (
    <section id="arc" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 md:px-6 md:py-28">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Heading
            eyebrow="Built on Arc"
            title="Made for a chain where money is the native asset."
            lead="Arc runs on stablecoins, settles in under a second, and has the building blocks a clearinghouse needs."
          />
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 0.04}>
              <li className="grid gap-4 p-6 sm:grid-cols-[8.5rem_1fr] sm:items-baseline">
                <div className="flex flex-col">
                  <span className={`text-2xl font-semibold tracking-tight text-primary ${it.mono ? "font-mono text-lg" : ""}`}>{it.fact}</span>
                  <span className="text-xs text-muted-foreground">{it.unit}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-medium">{it.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{it.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- faq */

export function Faq() {
  const qa = [
    ["Is this a lending platform?", "No. Setoff settles debts that already exist, with no interest. Businesses can optionally give a trusted partner a credit line from their own deposit; that risk stays between the two of them."],
    ["Who holds my money?", "An open contract with no owner and no admin. Only you can withdraw your balance, and it only goes down for bills you approved."],
    ["What does it cost?", "Arc fees are paid in USDC. A cycle of 25 bills costs about two cents in total, shared by the whole network."],
    ["I'm owed EURC but owe USDC. Do I deposit USDC?", "Not if you opt in. A cycle can swap your leftover with someone who has the opposite, never below the minimum rate you set."],
    ["What if I'm short when a cycle runs?", "The cycle pays as much of your bills as your deposit covers, and the rest waits for the next one. If a partner gave you a credit line, the gap can come from that."],
    ["What if a bill is wrong?", "Dispute it. That freezes the bill until you and the other side propose the same amount still owed — or 0 to cancel it. Nobody else can decide it."],
  ];
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-14 md:px-6 md:py-28">
      <Heading eyebrow="Questions" title="The short answers." center />
      <div className="mt-12 flex flex-col gap-3">
        {qa.map(([q, a], i) => (
          <Reveal key={q} delay={i * 0.04}>
            <details className="group rounded-xl border border-border bg-card px-5 open:border-primary/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {q}
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-5 leading-7 text-muted-foreground">{a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ agents */

function AgentTranscript() {
  const lines: { who: "you" | "agent" | "tool"; text: string }[] = [
    { who: "you", text: "Bill the search agent 4.50 USDC for yesterday's 900 summaries." },
    { who: "tool", text: "create_invoice → link ready, nothing onchain yet" },
    { who: "agent", text: "Done. It's waiting in their Setoff app for a free approval." },
    { who: "you", text: "What do I owe before the next cycle?" },
    { who: "tool", text: "get_position → owe 12.00 · owed 9.75 · net −2.25" },
    { who: "agent", text: "You're 2.25 USDC net. Want me to deposit it?" },
    { who: "you", text: "Yes." },
    { who: "tool", text: "deposit 2.25 USDC → confirmed" },
  ];
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-8 inset-x-0 md:-inset-8 rounded-[2rem] bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_70%)]"
      />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <span className="font-mono text-[11px] text-muted-foreground">agent · setoff mcp</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> 16 tools
          </span>
        </div>
        <ol className="flex flex-col gap-3 p-5" aria-hidden>
          {lines.map((l, i) =>
            l.who === "tool" ? (
              <li key={i} className="ml-1 border-l-2 border-primary/50 pl-3 font-mono text-xs text-muted-foreground">
                {l.text}
              </li>
            ) : (
              <li key={i} className={`flex ${l.who === "you" ? "justify-end" : "justify-start"}`}>
                <span
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    l.who === "you" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-card"
                  }`}
                >
                  {l.text}
                </span>
              </li>
            ),
          )}
        </ol>
      </div>
    </div>
  );
}

export function Agents() {
  return (
    <section id="agents" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 md:px-6 md:py-28">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
        <Reveal className="flex flex-col gap-6">
          <p className="text-sm font-medium text-primary">For AI agents</p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">Agents can settle up too.</h2>
          <p className="max-w-md text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
            Agents that buy from other agents run up hundreds of tiny bills. Setoff&apos;s MCP server lets any AI agent bill, approve, fund
            its net and check its position — in plain language, with a spending limit you set.
          </p>
          <ul className="flex flex-col gap-2.5">
            {["Works with Claude, Cursor and any MCP client", "Per-action spending cap on every agent", "Same invoice links as the app"].map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm">
                <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3" aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <Link href="/docs/agents" className="inline-flex h-11 w-fit items-center gap-2 rounded-lg border border-border px-5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Connect an agent <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <AgentTranscript />
        </Reveal>
      </div>
    </section>
  );
}
