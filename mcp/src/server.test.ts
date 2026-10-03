/**
 * Drives the MCP server through a real MCP client against a running network
 * (run ./scripts/local.sh first, then: set -a; . ../.local.env; set +a; npm test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.ts";
import { agentFromEnv } from "./setoff.ts";

async function connect(pk: string) {
  const server = createServer(agentFromEnv({ SETOFF_AGENT_PK: pk, SETOFF_MAX_AMOUNT: "10" }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = r.content[0]!.text;
    return { error: r.isError ? text : undefined, data: r.isError ? undefined : JSON.parse(text) };
  };
  return { client, call };
}

const A = process.env.TESTER_PK!;
const B = process.env.TESTER2_PK!;
const B_ADDR = process.env.TESTER2_ADDR!;

test("exposes the tools", async () => {
  const { client } = await connect(A);
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "approve_invoice",
    "create_invoice",
    "deposit",
    "dispute_bill",
    "get_position",
    "list_bills",
    "list_invoice_requests",
    "post_invoice",
    "preview_next_cycle",
    "propose_amount",
    "record_iou",
    "repay_credit",
    "set_credit_line",
    "set_fx_preference",
    "setoff_info",
    "withdraw",
  ]);
});

test("agent A bills agent B; B approves and posts it; it shows up as open", async () => {
  const a = await connect(A);
  const b = await connect(B);
  const info = await a.call("setoff_info");
  assert.equal(info.data.agent.maxAmountPerAction, "10");

  const inv = await a.call("create_invoice", { debtor: B_ADDR, amount: "2.25", token: "USDC", note: "MCP test: 1,000 API calls" });
  assert.ok(!inv.error, inv.error ?? "");
  assert.match(inv.data.link, /\/app\/bills\?invoice=/);
  assert.ok(inv.data.sentToTheirApp.hash, "invoice was sent to the debtor's app");

  const waiting = await b.call("list_invoice_requests");
  assert.ok(waiting.data.some((x: { invoice: string }) => x.invoice === inv.data.invoice), "B sees it waiting");

  const approved = await b.call("approve_invoice", { invoice: inv.data.link, post: true });
  assert.ok(!approved.error, approved.error ?? "");
  assert.ok(approved.data.posted.hash);

  const after = await b.call("list_invoice_requests");
  assert.ok(!after.data.some((x: { invoice: string }) => x.invoice === inv.data.invoice), "gone once added");

  const bills = await b.call("list_bills", { address: B_ADDR, status: "pending" });
  assert.ok(bills.data.some((x: { note?: string; amount: string }) => x.note === "MCP test: 1,000 API calls" && x.amount === "2.25"));

  const pos = await b.call("get_position");
  assert.ok(Number(pos.data.positions.USDC.owe) >= 2.25);
});

test("spending cap refuses large amounts", async () => {
  const a = await connect(A);
  const r = await a.call("create_invoice", { debtor: B_ADDR, amount: "50", token: "USDC", note: "too much" });
  assert.match(r.error ?? "", /above this agent's limit of 10/);
});

test("an agent can't approve a bill that isn't addressed to it", async () => {
  const a = await connect(A);
  const inv = await a.call("create_invoice", { debtor: B_ADDR, amount: "1", token: "USDC", note: "for B only" });
  const r = await a.call("approve_invoice", { invoice: inv.data.link });
  assert.match(r.error ?? "", /isn't billed to this agent/);
});

test("preview_next_cycle reports what would move", async () => {
  const a = await connect(A);
  const r = await a.call("preview_next_cycle");
  assert.ok(!r.error, r.error ?? "");
  assert.ok(r.data.openBills >= 1);
});
