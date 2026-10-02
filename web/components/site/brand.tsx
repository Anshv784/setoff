import Link from "next/link";

export const REPO = "https://github.com/Anshv784/setoff";

/** Mark: an "S" drawn as two opposing curves meeting in the middle, like debts cancelling. */
export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path d="M21 9h-7.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H11" fill="none" className="stroke-background" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <Mark />
      <span className="text-lg">Setoff</span>
    </Link>
  );
}
