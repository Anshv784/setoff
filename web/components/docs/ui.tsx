"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, Info, TriangleAlert } from "lucide-react";

export const DOCS = [
  { href: "/docs", title: "Introduction", group: "Overview" },
  { href: "/docs/how-it-works", title: "How it works", group: "Overview" },
  { href: "/docs/architecture", title: "Architecture", group: "Design" },
  { href: "/docs/contract", title: "Smart contract", group: "Design" },
  { href: "/docs/solver", title: "Solver", group: "Design" },
  { href: "/docs/arc", title: "Built on Arc", group: "Design" },
  { href: "/docs/agents", title: "For AI agents", group: "Developers" },
  { href: "/docs/run", title: "Run & deploy", group: "Developers" },
  { href: "/docs/faq", title: "FAQ", group: "Developers" },
] as const;

const isActive = (pathname: string, href: string) => pathname.replace(/\/$/, "") === href;

export function DocsSidebar() {
  const pathname = usePathname();
  const groups = [...new Set(DOCS.map((d) => d.group))];
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6 text-sm">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{g}</p>
          {DOCS.filter((d) => d.group === g).map((d) => {
            const active = isActive(pathname, d.href);
            return (
              <Link
                key={d.href}
                href={d.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {d.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Previous / next links at the foot of each page. */
export function PageNav() {
  const pathname = usePathname();
  const i = DOCS.findIndex((d) => isActive(pathname, d.href));
  const prev = i > 0 ? DOCS[i - 1] : undefined;
  const next = i >= 0 && i < DOCS.length - 1 ? DOCS[i + 1] : undefined;
  return (
    <div className="mt-16 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="group flex flex-col gap-1 rounded-xl border border-border p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="size-3" aria-hidden /> Previous
          </span>
          <span className="font-medium">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="group flex flex-col items-end gap-1 rounded-xl border border-border p-4 text-right transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Next <ArrowRight className="size-3" aria-hidden />
          </span>
          <span className="font-medium">{next.title}</span>
        </Link>
      )}
    </div>
  );
}

export function DocTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="mb-10 flex flex-col gap-3">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="max-w-2xl text-lg leading-8 text-muted-foreground">{lead}</p>
    </header>
  );
}

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-14 mb-4 scroll-mt-24 text-2xl font-semibold tracking-tight">
      <a href={`#${id}`} className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        {children}
      </a>
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-3 text-lg font-medium">{children}</h3>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="my-4 max-w-3xl leading-7 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">{children}</p>;
}

export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="my-4 flex max-w-3xl list-disc flex-col gap-2 pl-5 leading-7 text-muted-foreground marker:text-primary [&_strong]:font-medium [&_strong]:text-foreground">{children}</ul>;
}

export function Code({ children, lang }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-5 overflow-hidden rounded-xl border border-border bg-card">
      {lang && <div className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">{lang}</div>}
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-foreground">
        <code>{children.trim()}</code>
      </pre>
      <button
        type="button"
        aria-label="Copy code"
        onClick={async () => {
          await navigator.clipboard.writeText(children.trim());
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export function Callout({ kind = "info", title, children }: { kind?: "info" | "warn"; title: string; children: React.ReactNode }) {
  const Icon = kind === "warn" ? TriangleAlert : Info;
  return (
    <aside className={`my-6 flex max-w-3xl gap-3 rounded-xl border p-4 ${kind === "warn" ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${kind === "warn" ? "text-destructive" : "text-primary"}`} aria-hidden />
      <div className="flex flex-col gap-1 text-sm leading-6">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>
      </div>
    </aside>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-card">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border-b border-border px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 align-top">
              {r.map((cell, j) => (
                <td key={j} className="px-4 py-3 leading-6 text-muted-foreground [&_code]:text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Figure({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="my-8 flex flex-col gap-3">
      <div className="overflow-x-auto rounded-2xl border border-border bg-[radial-gradient(80%_70%_at_50%_40%,color-mix(in_oklch,var(--primary)_7%,var(--card)),var(--background))] p-4 md:p-6">
        {children}
      </div>
      <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
