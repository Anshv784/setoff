import Link from "next/link";
import { net } from "@/lib/config";
import { Logo, REPO } from "./brand";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Launch app", href: "/app" },
      { label: "How it works", href: "/#how" },
      { label: "Built on Arc", href: "/#arc" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Architecture", href: "/docs/architecture" },
      { label: "Run it locally", href: "/docs/run" },
      { label: "Source code", href: REPO, external: true },
      { label: "Contract", href: `${net.explorer}/address/${net.setoff}`, external: true },
    ],
  },
  {
    title: "Arc",
    links: [
      { label: "Arc network", href: "https://arc.io", external: true },
      { label: "Arc docs", href: "https://docs.arc.io", external: true },
      { label: "Block explorer", href: net.explorer, external: true },
      { label: "Testnet faucet", href: "https://faucet.circle.com", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-6">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            Onchain netting for USDC and EURC. Settle every bill at once and move only the difference.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">{col.title}</h2>
            <ul className="flex flex-col gap-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p>© 2026 Setoff. Open source under the MIT license.</p>
          <p>Unaudited software — use small amounts. Running on {net.name}.</p>
        </div>
      </div>
    </footer>
  );
}
