import type { Metadata } from "next";
import { C, Callout, Code, DocTitle, H2, List, P, Table } from "@/components/docs/ui";

export const metadata: Metadata = { title: "For AI agents" };

export default function Page() {
  return (
    <>
      <DocTitle
        eyebrow="Developers"
        title="For AI agents"
        lead="Setoff ships an MCP server with 14 tools, so any AI agent can bill other agents, approve what it owes, fund its net, settle disputes and manage credit, in plain language."
      />

      <H2 id="why">Why agents need netting</H2>
      <P>
        Agents that buy services from other agents run up many small bills in both directions: an agent pays for search, gets paid for
        summaries, pays for compute. Settling each one separately is wasteful. With Setoff, an agent records what it owes and is owed as it
        goes, and one cycle settles it all, moving only the net.
      </P>

      <H2 id="tools">Tools</H2>
      <Table
        head={["Tool", "What it does", "Onchain?"]}
        rows={[
          [<C key="1">setoff_info</C>, "Network, contract, tokens, and this agent's wallet and limit", "Read"],
          [<C key="2">get_position</C>, "What an address owes and is owed, its net, its deposit, and what to deposit next", "Read"],
          [<C key="3">list_bills</C>, "Bills, filtered by party and status", "Read"],
          [<C key="4">preview_next_cycle</C>, "What would settle, and how much would move, if a cycle ran now", "Read"],
          [<C key="5">create_invoice</C>, "Bill someone; returns a link they approve for free", "No"],
          [<C key="6">approve_invoice</C>, "Sign an invoice billed to this agent; optionally post it", "Free signature (+ post)"],
          [<C key="7">post_invoice</C>, "Put an approved invoice onchain", "Yes"],
          [<C key="8">record_iou</C>, "Record a bill this agent owes", "Yes"],
          [<C key="9">deposit</C>, "Fund this agent's net position", "Yes"],
          [<C key="10">withdraw</C>, "Take this agent's balance back to its wallet", "Yes"],
          [<C key="11">dispute_bill</C>, "Freeze a bill this agent is part of", "Yes"],
          [<C key="12">propose_amount</C>, "Propose what's still owed on a disputed bill; matching offers resolve it", "Yes"],
          [<C key="13">set_credit_line</C>, "Let a trusted party overdraw up to a limit from this agent's deposit", "Yes"],
          [<C key="14">repay_credit</C>, "Repay a lender from this agent's balance", "Yes"],
        ]}
      />
      <P>
        Invoice links are the same format as the web app&apos;s, so an agent can bill a person, a person can bill an agent, and either side
        can open the link in the app.
      </P>

      <H2 id="setup">Set it up</H2>
      <P>
        Clone the repository and install the server&apos;s dependencies (plus the solver&apos;s, which it reuses):
      </P>
      <Code lang="bash">{`
git clone --recursive https://github.com/Anshv784/setoff && cd setoff
(cd solver && npm install) && (cd mcp && npm install)
`}</Code>
      <P>
        <strong>Claude Code:</strong>
      </P>
      <Code lang="bash">{`
claude mcp add setoff \\
  -e SETOFF_NETWORK=mainnet \\
  -e SETOFF_AGENT_PK=0xYOUR_AGENT_KEY \\
  -e SETOFF_MAX_AMOUNT=10 \\
  -- npx tsx /path/to/setoff/mcp/src/server.ts
`}</Code>
      <P>
        <strong>Claude Desktop, Cursor and other MCP clients</strong> (<C>mcpServers</C> in the client&apos;s config file):
      </P>
      <Code lang="json">{`
{
  "mcpServers": {
    "setoff": {
      "command": "npx",
      "args": ["tsx", "/path/to/setoff/mcp/src/server.ts"],
      "env": {
        "SETOFF_NETWORK": "mainnet",
        "SETOFF_AGENT_PK": "0xYOUR_AGENT_KEY",
        "SETOFF_MAX_AMOUNT": "10"
      }
    }
  }
}
`}</Code>
      <Table
        head={["Variable", "Meaning"]}
        rows={[
          [<C key="n">SETOFF_NETWORK</C>, <span key="n2"><C>mainnet</C>, <C>testnet</C> or <C>local</C></span>],
          [<C key="k">SETOFF_AGENT_PK</C>, "The agent's own wallet key. Leave it out for read-only tools."],
          [<C key="m">SETOFF_MAX_AMOUNT</C>, "Largest amount the agent may bill, approve, record or deposit in one action. Default 10."],
          [<C key="u">SETOFF_APP_URL</C>, "Where invoice links should open. Default http://localhost:3000."],
        ]}
      />

      <H2 id="safety">Safety</H2>
      <List>
        <li>
          <strong>Give the agent its own wallet</strong> with only what it needs. Never reuse a personal key.
        </li>
        <li>
          <strong>Every spending action is capped</strong> by <C>SETOFF_MAX_AMOUNT</C>. Anything above it is refused before a transaction is
          built.
        </li>
        <li>
          <strong>An agent can only approve bills addressed to it,</strong> and transactions are simulated before they&apos;re sent.
        </li>
        <li>
          <strong>The contract still checks everything.</strong> An agent can&apos;t move anyone else&apos;s money or overdraw itself.
        </li>
      </List>
      <Callout kind="warn" title="Keys in config files">
        MCP config files store the key in plain text on your machine. Use a dedicated agent wallet with small balances.
      </Callout>

      <H2 id="examples">Try asking</H2>
      <List>
        <li>&quot;Bill 0xAB…12 4.50 USDC for yesterday&apos;s 900 summarisation calls, and give me the link.&quot;</li>
        <li>&quot;Approve this invoice and post it: https://…/app/bills?invoice=…&quot;</li>
        <li>&quot;What do I owe across Setoff, and how much should I deposit before the next cycle?&quot;</li>
        <li>&quot;If the next cycle ran now, how much money would actually move?&quot;</li>
      </List>
    </>
  );
}
