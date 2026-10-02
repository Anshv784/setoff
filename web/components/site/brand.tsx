import Link from "next/link";

export const REPO = "https://github.com/Anshv784/setoff";

/** Mark: two offset bars — what you owe and what you're owed, shifted against each other. */
export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M4 12h17M11 20h17" className="stroke-foreground" strokeWidth="4" strokeLinecap="round" />
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

