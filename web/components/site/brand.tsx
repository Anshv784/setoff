import Link from "next/link";

export const REPO = "https://github.com/Anshv784/setoff";

/** Two bars: obligations stacked, then cancelled down to the net. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M9 12h14M9 20h8" className="stroke-primary-foreground" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="text-lg">Setoff</span>
    </Link>
  );
}
