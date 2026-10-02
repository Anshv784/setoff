import { BadgeCheck } from "lucide-react";
import { labelOf, net } from "@/lib/config";
import { shortAddr } from "@/lib/format";

/** An address, with its demo role when known, linking to the explorer. */
export function Party({ address }: { address: string }) {
  const label = labelOf(address);
  if (net.local) {
    return (
      <span className="inline-flex flex-col leading-tight">
        {label && <Name label={label} />}
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
      {label && <Name label={label} />}
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

function Name({ label }: { label: { name: string; agentId?: bigint } }) {
  if (label.agentId === undefined) return <span className="text-sm">{label.name}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm" title={`ERC-8004 identity #${label.agentId}`}>
      {label.name}
      <BadgeCheck className="size-3.5 text-muted-foreground" aria-label="Registered ERC-8004 identity" />
    </span>
  );
}
