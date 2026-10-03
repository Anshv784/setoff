import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocTitle, Figure, H2, List, P, Table } from "@/components/docs/ui";
import { NettingDiagram } from "@/components/docs/diagrams";

export const metadata: Metadata = { title: "Introduction" };

export default function Page() {
  return (
    <>
      <DocTitle
        eyebrow="Introduction"
        title="Setoff is a clearinghouse for what people owe each other."
        lead="Businesses, freelancers and agents record their bills on Arc. Each cycle, Setoff settles every bill at once and only the net difference is paid."
      />
      <H2 id="problem">The problem</H2>
      <P>
        Companies that trade with each other owe each other money in both directions. Paid one bill at a time, every invoice moves its full
        amount, and each business has to hold enough cash to cover <strong>everything it owes</strong>, even when most of it is coming
        straight back from the same partners.
      </P>
      <P>
        Banks, card networks and stock exchanges solved this decades ago with <strong>netting</strong>: add up what each party owes and is
        owed, cancel the overlap, and settle only the difference. Setoff brings that to anyone with a wallet, as an open contract on Arc.
      </P>
      <Figure caption="Three bills worth 27 USDC. After netting, A deposits 2 and all three are discharged; B and C each end 1 ahead.">
        <NettingDiagram />
      </Figure>
      <H2 id="what-it-does">What Setoff does</H2>
      <List>
        <li>
          <strong>Bills go onchain.</strong> A creditor sends an invoice, which shows up in the debtor&apos;s app; the debtor approves it with a free signature. Or a debtor records
          what it owes directly. Each bill carries an amount in USDC or EURC, a deadline and an invoice note.
        </li>
        <li>
          <strong>You fund only your net.</strong> Owe 10 and owed 8? Deposit 2. The app tells you the exact number.
        </li>
        <li>
          <strong>One cycle settles everything.</strong> A solver picks the bills that deposits can cover; the contract recomputes every
          position and settles them in one atomic transaction.
        </li>
        <li>
          <strong>Withdraw any time.</strong> Whatever you&apos;re owed sits in your balance until you take it out.
        </li>
      </List>
      <H2 id="also">Also built in</H2>
      <List>
        <li>
          <strong>Partial payments.</strong> Short this cycle? It pays what your deposit covers; the rest waits.{" "}
          <Link href="/docs/how-it-works#partial" className="text-primary hover:underline">More</Link>
        </li>
        <li>
          <strong>Disputes.</strong> Freeze a bill and settle it by agreeing on what&apos;s still owed.{" "}
          <Link href="/docs/how-it-works#disputes" className="text-primary hover:underline">More</Link>
        </li>
        <li>
          <strong>Credit lines.</strong> Let a trusted partner overdraw from your deposit, up to a limit.{" "}
          <Link href="/docs/how-it-works#credit" className="text-primary hover:underline">More</Link>
        </li>
        <li>
          <strong>USDC ↔ EURC netting.</strong> Opt in to swap your leftover in one currency against someone else&apos;s in the other, never below your rate.{" "}
          <Link href="/docs/how-it-works#fx" className="text-primary hover:underline">More</Link>
        </li>
        <li>
          <strong>Private notes.</strong> Invoice text encrypted so only the two parties can read it.{" "}
          <Link href="/docs/how-it-works#private-notes" className="text-primary hover:underline">More</Link>
        </li>
        <li>
          <strong>Names.</strong> Counterparties show up by their ERC-8004 name instead of an address.
        </li>
        <li>
          <strong>AI agents.</strong> An MCP server gives any agent 14 Setoff tools, with a spending limit.{" "}
          <Link href="/docs/agents" className="text-primary hover:underline">More</Link>
        </li>
      </List>
      <H2 id="glance">At a glance</H2>
      <Table
        head={["", ""]}
        rows={[
          ["Currencies", "USDC and EURC, each netted separately"],
          ["Cost", "A cycle of 25 bills costs about $0.02 in gas, paid in USDC"],
          ["Speed", "Settled and final in under a second once a cycle runs"],
          ["Custody", "Funds sit in an open contract with no owner; only you can withdraw yours"],
        ]}
      />
      <Callout title="Not a lending platform">
        Nobody borrows and nobody earns interest. Setoff only settles debts that already exist, more cheaply. It is closer to Splitwise&apos;s
        &quot;simplify debts&quot; than to a loan.
      </Callout>
      <P>
        Next: <Link href="/docs/how-it-works" className="text-primary hover:underline">how a bill moves through Setoff</Link>.
      </P>
    </>
  );
}
