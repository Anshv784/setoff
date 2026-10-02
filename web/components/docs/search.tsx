"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Hash, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DOCS } from "./ui";

type Entry = { page: string; href: string; section?: string; anchor?: string; text: string };

// --------------------------------------------------------------------- index

let indexPromise: Promise<Entry[]> | undefined;

/** Builds the index once by reading the docs pages themselves, so it never drifts from the content. */
function loadIndex(): Promise<Entry[]> {
  indexPromise ??= Promise.all(
    DOCS.map(async (d) => {
      const html = await fetch(d.href).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, "text/html");
      const article = doc.querySelector("article");
      if (!article) return [];
      const out: Entry[] = [{ page: d.title, href: d.href, text: article.querySelector("header p:last-child")?.textContent ?? "" }];
      let section: string | undefined;
      let anchor: string | undefined;
      article.querySelectorAll("h2, h3, p, li, td, figcaption").forEach((el) => {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!text) return;
        if (el.tagName === "H2") {
          section = text;
          anchor = el.id || undefined;
          out.push({ page: d.title, href: d.href, section, anchor, text: "" });
        } else if (!el.closest("header")) {
          out.push({ page: d.title, href: d.href, section, anchor, text });
        }
      });
      return out;
    }),
  ).then((all) => all.flat());
  return indexPromise;
}

function search(index: Entry[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const hits: { e: Entry; score: number }[] = [];
  for (const e of index) {
    const title = `${e.page} ${e.section ?? ""}`.toLowerCase();
    const body = e.text.toLowerCase();
    if (!terms.every((t) => title.includes(t) || body.includes(t))) continue;
    let score = 0;
    for (const t of terms) score += (e.section ?? e.page).toLowerCase().includes(t) ? 5 : title.includes(t) ? 3 : 1;
    if (!e.text) score += 2; // a heading itself
    hits.push({ e, score });
  }
  hits.sort((a, b) => b.score - a.score);
  // One result per section keeps the list scannable.
  const seen = new Set<string>();
  return hits
    .filter(({ e }) => {
      const k = `${e.href}#${e.anchor ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 12)
    .map((h) => h.e);
}

function snippet(text: string, terms: string[]) {
  if (!text) return "";
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
  const start = Math.max(0, (Number.isFinite(at) ? at : 0) - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + 140) + (start + 140 < text.length ? "…" : "");
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

// ------------------------------------------------------------------ context

const Ctx = createContext<{ open: () => void } | null>(null);

export function DocsSearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <SearchDialog open={isOpen} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

export function SearchButton({ className = "" }: { className?: string }) {
  const ctx = useContext(Ctx);
  const mac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );
  return (
    <button
      type="button"
      onClick={() => ctx?.open()}
      className={`flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <Search className="size-4" aria-hidden />
      <span className="flex-1 text-left">Search docs</span>
      <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[11px]">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [index, setIndex] = useState<Entry[]>();
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open || index) return;
    loadIndex()
      .then(setIndex)
      .catch(() => setFailed(true));
  }, [open, index]);

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const results = useMemo(() => (index ? search(index, query) : []), [index, query]);

  const go = (e: Entry) => {
    onOpenChange(false);
    setQuery("");
    router.push(e.anchor ? `${e.href}#${e.anchor}` : e.href);
  };

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search documentation</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Search for solver, deposit, Memo, security…"
            aria-label="Search documentation"
            aria-controls="docs-results"
            aria-activedescendant={results[active] ? `r${active}` : undefined}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {failed ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Search couldn&apos;t load. Check your connection and try again.</p>
          ) : !index ? (
            <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Building the index…
            </p>
          ) : !query ? (
            <Suggestions onPick={(q) => setQuery(q)} />
          ) : results.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No results for &quot;{query}&quot;. Try a shorter word.
            </p>
          ) : (
            <ul id="docs-results" ref={list} role="listbox" className="flex flex-col gap-1">
              {results.map((e, i) => (
                <li key={`${e.href}${e.anchor}${i}`} id={`r${i}`} role="option" aria-selected={i === active} data-index={i}>
                  <button
                    type="button"
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(e)}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${i === active ? "bg-primary/10" : ""}`}
                  >
                    {e.section ? <Hash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        <Highlight text={e.section ?? e.page} terms={terms} />
                      </span>
                      <span className="text-xs text-muted-foreground">{e.section ? e.page : "Page"}</span>
                      {e.text && (
                        <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                          <Highlight text={snippet(e.text, terms)} terms={terms} />
                        </span>
                      )}
                    </span>
                    {i === active && <CornerDownLeft className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            <kbd className="font-mono">↑↓</kbd> to move
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> to open
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  const picks = ["solver", "deposit", "invoice", "Memo", "blocklist", "withdraw", "ERC-8004", "run locally"];
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Try</p>
      <div className="flex flex-wrap gap-2">
        {picks.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="h-8 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- outline

/** "On this page": the page's sections, with the one in view highlighted. */
export function OnThisPage() {
  const pathname = usePathname();
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  const [current, setCurrent] = useState<string>();

  useEffect(() => {
    let io: IntersectionObserver | undefined;
    // Wait a frame so the new page's headings are in the DOM after navigation.
    const raf = requestAnimationFrame(() => {
    const heads = [...document.querySelectorAll<HTMLElement>("article h2[id]")];
    setItems(heads.map((h) => ({ id: h.id, text: h.textContent ?? "" })));
    setCurrent(heads[0]?.id);
    io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    heads.forEach((h) => io!.observe(h));
    });
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [pathname]);

  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="flex flex-col gap-2 text-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">On this page</p>
      <ul className="flex flex-col gap-1 border-l border-border">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={current === i.id ? "location" : undefined}
              className={`-ml-px block border-l py-1 pl-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                current === i.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
