import { labelOf, net } from "@/lib/config";
import { shortAddr } from "@/lib/format";

/** An address, with its demo role when known, linking to the explorer. */
export function Party({ address }: { address: string }) {
  const label = labelOf(address);
  if (net.local) {
    return (
      <span className="inline-flex flex-col leading-tight">
        {label && <span className="text-sm">{label}</span>}
        <span className="font-mono text-xs text-muted-foreground">{shortAddr(address)}</span>
      </span>
    );
  }
  return (
    <a
      href={`${net.explorer}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex flex-col rounded-sm leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label && <span className="text-sm">{label}</span>}
      <span className="font-mono text-xs text-muted-foreground">{shortAddr(address)}</span>
    </a>
  );
}

export function TxLink({ hash, children }: { hash: string; children?: React.ReactNode }) {
  if (net.local) return <span className="font-mono text-xs text-muted-foreground">{shortAddr(hash)}</span>;
  return (
    <a
      href={`${net.explorer}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    >
      {children ?? shortAddr(hash)}
    </a>
  );
}
