import type { Metadata } from "next";
import { C, DocTitle, H2, P, Table } from "@/components/docs/ui";

export const metadata: Metadata = { title: "Built on Arc" };

export default function Page() {
  return (
    <>
      <DocTitle
        eyebrow="Design"
        title="Built on Arc"
        lead="Setoff leans on what makes Arc different from a generic EVM chain. Each feature below is used in the live flow."
      />
      <Table
        head={["Arc feature", "How Setoff uses it", "Why it matters"]}
        rows={[
          ["USDC as gas", "Participants hold one asset for fees and settlement. Native USDC is the ERC-20 balance, so one top-up covers both.", "No second token to explain or buy. A 25-bill cycle costs about $0.016."],
          [<span key="m">Memo <C>0x5294…e505</C></span>, "Every IOU is posted, and every cycle settled, through Memo with a note.", "Invoice text and cycle summaries are indexed onchain, which is what makes the reconciliation CSV possible."],
          [<span key="c">Multicall3From <C>0x522f…47D0</C></span>, "Approve + deposit in one transaction, with the wallet kept as sender.", "One confirmation instead of two."],
          ["Deterministic sub-second finality", "A settled cycle is final immediately.", "Cycles can run every few minutes; creditors can withdraw right away."],
          ["EURC", "Second settlement currency, netted on its own.", "Cross-border businesses can bill in euros."],
          ["ERC-8004 identity", "Participants register a name; the dashboard shows it and checks current ownership.", "Counterparties by name, not hex."],
          ["USDC blocklist", "Settlement is ledger-only, and withdrawals are pull-based.", "A frozen address can't stall anyone else's cycle."],
        ]}
      />
      <H2 id="costs">What it costs</H2>
      <P>Fees on Arc are paid in USDC. At Arc&apos;s typical base fee of 20 gwei:</P>
      <Table
        head={["Action", "Gas", "≈ USD"]}
        rows={[
          ["Deploy Setoff", "2,598,084", "$0.05"],
          ["Settle 6 IOUs", "323,108", "$0.006"],
          ["Settle 25 IOUs", "808,323", "$0.016"],
          ["Partial payment cycle (1 IOU)", "115,629", "$0.002"],
          ["Register an ERC-8004 name", "177,852", "$0.004"],
        ]}
      />
    </>
  );
}
