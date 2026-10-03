"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Check, Copy } from "lucide-react";

const NETWORK = process.env.NEXT_PUBLIC_SETOFF_NETWORK ?? "testnet";

/** Wallet page: how to give an AI agent its own Setoff tools. */
export function AgentCard() {
  const [copied, setCopied] = useState(false);
  const cmd = `claude mcp add setoff -e SETOFF_NETWORK=${NETWORK} -e SETOFF_AGENT_PK=0x… -e SETOFF_MAX_AMOUNT=10 -- npx tsx setoff/mcp/src/server.ts`;
  return (
    <section aria-labelledby="agent" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="agent" className="text-base font-medium">
          Connect an AI agent
        </h2>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Give an agent its own wallet and Setoff tools: it can bill, approve, deposit and check its net, within a spending limit you set.
      </p>
      <div className="relative rounded-lg border border-border bg-background">
        <pre className="overflow-x-auto p-3 pr-11 font-mono text-[11px] leading-5 text-muted-foreground">{cmd}</pre>
        <button
          type="button"
          aria-label="Copy command"
          onClick={async () => {
            await navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
      </div>
      <Link href="/docs/agents" className="w-fit text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Setup guide, tools and safety
      </Link>
    </section>
  );
}
