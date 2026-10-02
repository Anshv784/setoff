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
          <strong>Bills go onchain.</strong> A creditor sends an invoice link; the debtor approves it with a free signature. Or a debtor records
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
      <H2 id="numbers">In numbers</H2>
      <Table
        head={["", "Measured"]}
        rows={[
          ["Liquidity saved in demo cycles", "61–66% of face value never moved"],
          ["Cost of a 25-bill cycle", "821,314 gas ≈ $0.016 at Arc mainnet prices"],
          ["Solver quality", "93.1% of the brute-force optimum, exact in 175 of 200 random pools"],
          ["Tests", "22 contract tests (unit, 1,000-run fuzz, 16k-call invariants) + 8 solver tests"],
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
