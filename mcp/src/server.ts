#!/usr/bin/env -S npx tsx
/**
 * Setoff MCP server: lets AI agents bill, approve, deposit and check positions on Setoff.
 *
 *   SETOFF_NETWORK=mainnet SETOFF_AGENT_PK=0x... SETOFF_MAX_AMOUNT=10 npx tsx mcp/src/server.ts
 *
 * Read-only tools work without a key. Tools that sign or spend need SETOFF_AGENT_PK, and
 * refuse any single amount above SETOFF_MAX_AMOUNT (default 10).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatUnits, isAddress, type Address } from "viem";
import * as s from "./setoff.ts";

const address = z.string().refine(isAddress, "must be a 0x address").describe("A 0x… wallet address");
const amount = z.string().regex(/^\d+(\.\d{1,6})?$/, "a decimal like 12.50").describe("Amount, e.g. \"12.50\"");
const token = z.enum(["USDC", "EURC"]).default("USDC").describe("Settlement currency");

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] });
const guard =
  <A,>(fn: (a: A) => Promise<unknown>) =>
  async (a: A) => {
    try {
      return ok(await fn(a));
    } catch (e) {
      return fail(e);
    }
  };

export function createServer(agent = s.agentFromEnv()) {
  const server = new McpServer({ name: "setoff", version: "1.0.0" });
  const needAgent = () => {
    if (!agent) throw new Error("This tool needs the agent's wallet: set SETOFF_AGENT_PK in the MCP server's environment.");
    return agent;
  };

  server.registerTool(
    "setoff_info",
    {
      title: "About this Setoff deployment",
      description: "Network, contract address, settlement tokens, and this agent's wallet and spending limit.",
      annotations: { readOnlyHint: true },
    },
    guard(async () => ({
      network: s.net.chain.name,
      chainId: s.net.chain.id,
      contract: s.net.setoff,
      tokens: { USDC: s.tokenAddress("USDC"), EURC: s.tokenAddress("EURC") },
      agent: agent ? { address: agent.address, maxAmountPerAction: formatUnits(agent.maxAmount, 6) } : "read-only (no SETOFF_AGENT_PK)",
      howItWorks:
        "Bills (IOUs) between parties are netted each cycle; each party only funds its net position. Invoices are links the debtor approves with a free signature.",
    })),
  );

  server.registerTool(
    "get_position",
    {
      title: "Get a position",
      description: "What an address owes and is owed in open bills, its net, its deposit, and how much more it must deposit for the next cycle. Defaults to this agent.",
      inputSchema: { address: address.optional() },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ address: a }: { address?: string }) => s.getPosition((a as Address) ?? needAgent().address)),
  );

  server.registerTool(
    "list_bills",
    {
      title: "List bills",
      description: "Bills recorded on Setoff, newest first. Filter by party and status.",
      inputSchema: {
        address: address.optional().describe("Only bills where this address is debtor or creditor"),
        status: z.enum(["pending", "settled", "cancelled", "expired", "all"]).default("all"),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ address: a, status, limit }: { address?: string; status: string; limit: number }) => {
      const me = a?.toLowerCase();
      return (await s.listBills())
        .filter((b) => (status === "all" || b.status === status) && (!me || b.debtor.toLowerCase() === me || b.creditor.toLowerCase() === me))
        .slice(0, limit);
    }),
  );

  server.registerTool(
    "preview_next_cycle",
    {
      title: "Preview the next cycle",
      description: "What would settle, and how much money would actually move, if a cycle ran now.",
      annotations: { readOnlyHint: true },
    },
    guard(() => s.previewNextCycle()),
  );

  server.registerTool(
    "create_invoice",
    {
      title: "Bill someone",
      description:
        "Create an invoice from this agent to a debtor. Returns a link to send them; nothing goes onchain until they approve it (free) and it's posted.",
      inputSchema: { debtor: address, amount, token, note: z.string().min(1).max(120).describe("What it's for, e.g. \"API calls, 2–9 Oct\""), days: z.number().int().min(1).max(30).default(7) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard((i: { debtor: string; amount: string; token: s.Token; note: string; days: number }) =>
      s.createInvoice(needAgent(), { ...i, debtor: i.debtor as Address }),
    ),
  );

  server.registerTool(
    "approve_invoice",
    {
      title: "Approve an invoice this agent owes",
      description: "Sign an invoice billed to this agent (free). Set post=true to also put it onchain now (costs a fraction of a cent).",
      inputSchema: { invoice: z.string().describe("The invoice link or its ?invoice= value"), post: z.boolean().default(false) },
      annotations: { destructiveHint: false },
    },
    guard((i: { invoice: string; post: boolean }) => s.approveInvoice(needAgent(), i)),
  );

  server.registerTool(
    "post_invoice",
    {
      title: "Post an approved invoice",
      description: "Put an invoice the debtor has already approved onchain, so it joins the next cycle.",
      inputSchema: { invoice: z.string().describe("The approved invoice link") },
    },
    guard((i: { invoice: string }) => s.postInvoice(needAgent(), i)),
  );

  server.registerTool(
    "record_iou",
    {
      title: "Record a bill this agent owes",
      description: "The agent records what it owes a creditor, directly onchain. It joins the next cycle.",
      inputSchema: { creditor: address, amount, token, note: z.string().min(1).max(120), days: z.number().int().min(1).max(30).default(7) },
    },
    guard((i: { creditor: string; amount: string; token: s.Token; note: string; days: number }) =>
      s.recordIOU(needAgent(), { ...i, creditor: i.creditor as Address }),
    ),
  );

  server.registerTool(
    "deposit",
    {
      title: "Deposit",
      description: "Deposit into Setoff to fund this agent's net position. Use get_position first to see how much is needed.",
      inputSchema: { amount, token },
    },
    guard((i: { amount: string; token: s.Token }) => s.deposit(needAgent(), i)),
  );

  server.registerTool(
    "withdraw",
    {
      title: "Withdraw",
      description: "Withdraw this agent's balance from Setoff back to its wallet.",
      inputSchema: { amount, token },
    },
    guard((i: { amount: string; token: s.Token }) => s.withdraw(needAgent(), i)),
  );

  server.registerTool(
    "dispute_bill",
    {
      title: "Dispute a bill",
      description: "Freeze an open bill this agent owes or is owed. No cycle can pay it until both sides propose the same amount still owed.",
      inputSchema: { id: z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe("The bill id (from list_bills)") },
    },
    guard((i: { id: string }) => s.disputeBill(needAgent(), { id: i.id as `0x${string}` })),
  );

  server.registerTool(
    "propose_amount",
    {
      title: "Propose what is still owed",
      description: "On a disputed bill, propose the amount still owed. When both parties propose the same amount the bill reopens at it; 0 cancels it.",
      inputSchema: { id: z.string().regex(/^0x[0-9a-fA-F]{64}$/), remaining: z.string().regex(/^\d+(\.\d{1,6})?$/) },
    },
    guard((i: { id: string; remaining: string }) => s.proposeAmount(needAgent(), { id: i.id as `0x${string}`, remaining: i.remaining })),
  );

  server.registerTool(
    "set_credit_line",
    {
      title: "Grant a credit line",
      description:
        "Let a trusted party overdraw up to a limit in cycles, funded from this agent's deposit and recorded as owed back. Risk: if they never repay, the agent loses what they drew. 0 stops new draws.",
      inputSchema: { borrower: address, limit: amount, token },
    },
    guard((i: { borrower: string; limit: string; token: s.Token }) => s.setCreditLine(needAgent(), { ...i, borrower: i.borrower as Address })),
  );

  server.registerTool(
    "repay_credit",
    {
      title: "Repay credit",
      description: "Repay a lender from this agent's Setoff balance.",
      inputSchema: { lender: address, amount, token },
    },
    guard((i: { lender: string; amount: string; token: s.Token }) => s.repayCredit(needAgent(), { ...i, lender: i.lender as Address })),
  );

  return server;
}

// Run over stdio when started directly (how MCP clients launch servers).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.ts")) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`Setoff MCP server running on ${s.net.chain.name}`);
}
