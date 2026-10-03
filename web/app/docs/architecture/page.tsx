import type { Metadata } from "next";
import { C, Callout, DocTitle, Figure, H2, List, Table } from "@/components/docs/ui";
import { ArchitectureDiagram, CycleDiagram } from "@/components/docs/diagrams";

export const metadata: Metadata = { title: "Architecture" };

export default function Page() {
  return (
    <>
      <DocTitle
        eyebrow="Design"
        title="Architecture"
        lead="One contract holds the truth. Everything off-chain is untrusted and replaceable: it can be slow or wrong, but it can't take anyone's money."
      />
      <Figure caption="Numbers follow a bill: (1) invoice link, (2) post through Memo, (3) fund through Multicall3From, (4) the solver reads the pool, (5) it settles through Memo, (6) the dashboard reads events.">
        <ArchitectureDiagram />
      </Figure>

      <H2 id="components">Components</H2>
      <Table
        head={["Component", "Where", "Responsibility", "Trust"]}
        rows={[
          [<strong key="a">Setoff contract</strong>, "Arc", "IOU pool (incl. partial payments and disputes), deposit ledger, credit lines, opt-in FX swaps, cycle verification and settlement", "The only source of truth. No owner, no admin, no upgrade path."],
          ["Memo", "Arc (system)", "Wraps calls so the sender is preserved and attaches an indexed note", "Arc protocol contract"],
          ["Multicall3From", "Arc (system)", "Batches approve + deposit with the wallet as sender", "Arc protocol contract"],
          ["ERC-8004 registry", "Arc", "Names for addresses; the dashboard verifies current ownership", "Display only"],
          ["Solver", "Off-chain cron", "Chooses which IOUs go into a cycle, how much of each to pay, and which credit to draw", "Untrusted. Anyone can run one."],
          ["MCP server", "Agent's machine", "Gives AI agents Setoff tools with a spending cap", "Untrusted. Uses the agent's own wallet."],
          ["Dashboard", "Static site", "Reads logs and contract state; prepares transactions for your wallet", "Untrusted. Your wallet signs everything."],
        ]}
      />

      <H2 id="cycle">One cycle, step by step</H2>
      <Figure caption="The solver only proposes. Every number the contract acts on is recomputed onchain from stored IOUs.">
        <CycleDiagram />
      </Figure>

      <H2 id="decisions">Key design decisions</H2>
      <List>
        <li>
          <strong>Settlement moves no tokens.</strong> <C>settle</C> only updates the internal ledger; tokens move on <C>deposit</C> and{" "}
          <C>withdraw</C>. On Arc, USDC is also the gas token and has a blocklist. If cycles pushed transfers, one blocklisted creditor could
          revert everyone&apos;s settlement. With pull-based withdrawals that can&apos;t happen.
        </li>
        <li>
          <strong>The pool lives onchain.</strong> IOUs are stored in contract storage, not an off-chain order book. On Arc storing one costs a
          fraction of a cent, and in return there is no database to run and anyone can build a competing solver from public data.
        </li>
        <li>
          <strong>Sorted parties instead of a hashmap.</strong> The solver passes the parties in strictly ascending order. The contract finds
          each party by binary search and the strict ordering proves no one is listed twice. No storage-heavy maps during settlement.
        </li>
        <li>
          <strong>No backend.</strong> The dashboard rebuilds everything from contract events and Memo events: IOUs, cycles, invoice notes,
          names. It can be hosted as static files anywhere.
        </li>
      </List>

      <H2 id="data">Where the dashboard&apos;s data comes from</H2>
      <Table
        head={["What you see", "Read from"]}
        rows={[
          ["IOUs and their status", <span key="1"><C>IOUSubmitted</C>, <C>IOUSettled</C>, <C>IOUCancelled</C> events</span>],
          ["Cycles, cleared vs. moved", <C key="2">CycleSettled(gross[], netFunded[])</C>],
          ["Invoice notes, cycle summaries", <span key="3"><C>Memo</C> events where the target is Setoff</span>],
          ["Names", <span key="4">ERC-8004 <C>Registered</C> events, checked with <C>ownerOf</C></span>],
          ["Your deposits", <C key="5">balanceOf(account, token)</C>],
        ]}
      />
      <Callout title="Arc RPC limit">
        Arc caps <C>eth_getLogs</C> at 10,000 blocks per call (about 85 minutes). The solver and dashboard read history in 10k-block windows,
        six in parallel, starting from the deployment block.
      </Callout>
    </>
  );
}
