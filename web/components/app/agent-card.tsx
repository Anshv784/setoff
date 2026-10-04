"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";

const NETWORK = process.env.NEXT_PUBLIC_SETOFF_NETWORK ?? "mainnet";

const TOOLS: [string, string][] = [
  ["get_position", "What it owes, is owed, and should deposit"],
  ["list_bills · preview_next_cycle", "Bills and what the next cycle would move"],
  ["create_invoice · list_invoice_requests", "Bill others (lands in their app); see invoices sent to it"],
  ["approve_invoice · post_invoice", "Approve bills it owes; put them onchain"],
  ["record_iou", "Record what it owes"],
  ["deposit · withdraw", "Fund its net; take money back"],
  ["dispute_bill · propose_amount", "Freeze a bill; settle it by agreement"],
  ["set_credit_line · repay_credit", "Lend to trusted parties; repay lenders"],
  ["set_fx_preference", "Opt in to USDC↔EURC netting, with a minimum rate"],
  ["setoff_info", "Network, contract and its own limit"],
];

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative rounded-lg border border-border bg-background">
        <pre className="overflow-x-auto p-3 pr-11 font-mono text-[11px] leading-5 text-muted-foreground">{text}</pre>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/** Agents page: what an agent can do on the left; setup on the right. */
export function AgentsPanel() {
  const card = "flex flex-col gap-5 rounded-xl border border-border bg-card p-6";
  const cli = `claude mcp add setoff \\\n  -e SETOFF_NETWORK=${NETWORK} \\\n  -e SETOFF_AGENT_PK=0xYOUR_AGENT_KEY \\\n  -e SETOFF_MAX_AMOUNT=10 \\\n  -- npx tsx /path/to/setoff/mcp/src/server.ts`;
  const json = JSON.stringify(
    {
      mcpServers: {
        setoff: {
          command: "npx",
          args: ["tsx", "/path/to/setoff/mcp/src/server.ts"],
          env: { SETOFF_NETWORK: NETWORK, SETOFF_AGENT_PK: "0xYOUR_AGENT_KEY", SETOFF_MAX_AMOUNT: "10" },
        },
      },
    },
    null,
    2,
  );
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="what" className={`${card} lg:sticky lg:top-24`}>
        <h2 id="what" className="text-base font-medium">
          What an agent can do
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Setoff&apos;s MCP server gives any AI agent its own Setoff tools. It works with Claude, Cursor and any MCP client, and the agent uses
          its own wallet.
        </p>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {TOOLS.map(([t, d]) => (
            <li key={t} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="font-mono text-xs text-foreground">{t}</span>
              <span className="text-xs text-muted-foreground">{d}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Built-in limits</p>
          <p>Every spending action is capped by SETOFF_MAX_AMOUNT and refused before a transaction is built.</p>
          <p>An agent can only approve bills addressed to it, and every transaction is simulated first.</p>
          <p>Give each agent its own wallet with small balances.</p>
        </div>
      </section>

      <section aria-labelledby="setup" className={card}>
        <h2 id="setup" className="text-base font-medium">
          Connect an agent
        </h2>
        <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>
            <span className="font-mono text-foreground">1</span> Clone the repo and run <span className="font-mono text-foreground">npm install</span>{" "}
            in <span className="font-mono text-foreground">solver/</span> and <span className="font-mono text-foreground">mcp/</span>.
          </li>
          <li>
            <span className="font-mono text-foreground">2</span> Create a wallet for the agent and fund it with a little USDC on Arc.
          </li>
          <li>
            <span className="font-mono text-foreground">3</span> Add the server to your client with one of these:
          </li>
        </ol>
        <CopyBlock label="Claude Code" text={cli} />
        <CopyBlock label="Claude Desktop, Cursor and other clients (mcpServers)" text={json} />
        <p className="text-sm text-muted-foreground">
          Then just ask: <span className="text-foreground">&quot;What do I owe before the next cycle?&quot;</span> or{" "}
          <span className="text-foreground">&quot;Bill 0x… 4.50 USDC for yesterday&apos;s calls.&quot;</span>
        </p>
        <Link href="/docs/agents" className="w-fit text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Full guide and examples
        </Link>
      </section>
    </div>
  );
}
