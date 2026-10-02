"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { GitHubMark, Logo, REPO } from "./brand";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#arc", label: "Built on Arc" },
  { href: "/docs", label: "Docs" },
  { href: REPO, label: "GitHub", external: true },
];

/** Transparent over the hero, frosted once the page scrolls. */
export function SiteNav({ cta = "app", children }: { cta?: "app" | "none"; children?: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled ? "border-b border-border bg-background/70 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1">
          <ul className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <li key={l.label}>
                {l.external ? (
                  <a href={l.href} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
                    <GitHubMark /> {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className={buttonVariants({ variant: "ghost" })}>
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {children}
          {cta === "app" && (
            <Link href="/app" className={buttonVariants({ variant: "default" })}>
              Launch app <ArrowUpRight aria-hidden />
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
