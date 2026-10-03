import type { Metadata } from "next";
import { C, Callout, DocTitle, Figure, H2, H3, List, P } from "@/components/docs/ui";
import { LifecycleDiagram } from "@/components/docs/diagrams";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return (
    <>
      <DocTitle eyebrow="Overview" title="How it works" lead="A bill's life in Setoff: from an invoice link to a settled cycle and a withdrawal." />
      <Figure caption="Every IOU is in exactly one state. Only pending IOUs can enter a cycle.">
        <LifecycleDiagram />
      </Figure>

      <H2 id="add-a-bill">1. Add a bill</H2>
      <H3>Send an invoice (gasless for the debtor)</H3>
      <P>
        The creditor fills in who owes, how much, the currency and what it&apos;s for. Setoff builds the IOU and puts it in a link. Nothing
        touches the chain yet. The debtor opens the link and approves it with an <strong>EIP-712 signature</strong>, which is free and needs
        no USDC. Anyone holding the approved link, usually the creditor, then posts it to the pool.
      </P>
      <H3>Record what you owe</H3>
      <P>
        A debtor can also post an IOU directly. Because the debtor is the sender, no signature is needed.
      </P>
      <P>
        Both paths go through Arc&apos;s <C>Memo</C> contract, so the invoice note is stored onchain alongside the IOU and the dashboard can
        show it later.
      </P>

      <H2 id="fund-your-net">2. Fund your net</H2>
      <P>
        Before a cycle, each party&apos;s position is simply <C>owed to you − you owe</C> per currency. Only net debtors need to deposit, and only
        the shortfall. The Wallet page computes it and offers a one-click deposit. Approve and deposit are batched into one transaction
        through Arc&apos;s <C>Multicall3From</C>, which keeps your wallet as the sender.
      </P>

      <H2 id="cycle">3. A cycle settles</H2>
      <P>
        A solver reads the pool and the deposits, chooses the set of pending IOUs that deposits can fully fund, and calls <C>settle</C>. The
        contract then:
      </P>
      <List>
        <li>checks every IOU is pending and not expired, and marks it settled</li>
        <li>recomputes each party&apos;s net position from the stored IOUs (it never trusts the solver&apos;s numbers)</li>
        <li>debits each net debtor&apos;s deposit and credits each net creditor</li>
        <li>emits the cycle&apos;s face value and the liquidity actually used</li>
      </List>
      <Callout title="All or nothing">
        If any net debtor is short by even one unit, the whole cycle reverts and nothing changes. A cycle can never leave someone half-paid.
      </Callout>

      <H2 id="withdraw">4. Withdraw</H2>
      <P>
        Credits sit in your Setoff balance. Withdraw whenever you like, or leave them in to fund your next cycle. Tokens leave the contract only
        on <C>withdraw</C>; settlement itself never transfers tokens.
      </P>

      <H2 id="partial">Paying in parts</H2>
      <P>
        If you can&apos;t cover a whole bill, a cycle can pay <strong>part of it</strong>, as much as your deposit allows, and the rest stays
        open for the next cycle. Your bills show the progress (for example &quot;Part paid · 1.50 of 4.00&quot;). A bill is only marked settled
        once it&apos;s paid in full, and no cycle can ever pay more than is owed.
      </P>

      <H2 id="disputes">Disputes</H2>
      <P>
        If something&apos;s wrong with a bill, either side can <strong>dispute</strong> it. That freezes it: no cycle can pay it. Then each side
        proposes how much is still owed. As soon as both proposals match, the bill reopens at that amount, or is cancelled if you agree on 0.
        Anything already paid stays paid.
      </P>
      <Callout title="No one else decides">
        There&apos;s no arbiter and no admin. Only the debtor and the creditor can resolve a dispute, and only by agreeing. Either side can still
        cancel a disputed bill outright.
      </Callout>

      <H2 id="credit">Credit lines</H2>
      <P>
        A business can let a partner it trusts <strong>overdraw up to a limit</strong>. If that partner is short when a cycle runs, the gap is
        paid from the lender&apos;s own deposit and recorded as owed back to the lender. The partner repays from their Setoff balance whenever
        they like. The lender can lower the limit, or set it to 0 to stop new draws, at any time.
      </P>
      <Callout kind="warn" title="The risk stays with the lender">
        Credit is a promise between two parties. If a borrower never repays, the lender loses what was drawn. Nobody else in the network is
        affected, and there&apos;s no interest: Setoff only records what was lent and repaid.
      </Callout>

      <H2 id="fx">USDC ↔ EURC netting (opt-in)</H2>
      <P>
        Bills are netted per currency, so being owed 10 EURC doesn&apos;t help pay 10.70 USDC you owe. If you opt in, a cycle can{" "}
        <strong>swap that leftover</strong> with another opted-in party whose leftover is the opposite, so neither of you deposits it. You
        opt in per direction (for example &quot;give up EURC for USDC&quot;) with a minimum rate, set on the Wallet page, a little below market.
      </P>
      <List>
        <li>The solver matches opted-in parties at a public reference rate (ECB) and skips anyone whose minimum it misses. They stay in their own currency that cycle.</li>
        <li>
          The contract checks every swap against the account&apos;s own minimum, requires what&apos;s sold to equal what&apos;s bought in each
          currency, and only converts the leftover, never a deposit.
        </li>
        <li>Parties who haven&apos;t opted in are never converted. Set the minimum to 0 to opt out.</li>
      </List>
      <Callout kind="warn" title="Your minimum is your worst case">
        Anyone can run a cycle, so a swap can happen at exactly your minimum, and the other party keeps the difference. Keep it close to market.
        Market makers through Circle&apos;s StableFX would be the next step for leftovers that have no match.
      </Callout>

      <H2 id="private-notes">Private notes</H2>
      <P>
        Invoice notes can be encrypted so only the debtor and creditor can read them. Each wallet turns this on once on the Wallet page: a free
        signature creates its key, and a tiny transaction publishes the public half through Memo. When both parties have it on, &quot;Keep this
        note private&quot; is ticked by default.
      </P>
      <List>
        <li>
          <strong>What stays private:</strong> the note text. It&apos;s sealed with X25519 and XChaCha20-Poly1305 (via the audited{" "}
          <C>@noble</C> libraries), with one copy of the key wrapped for each party.
        </li>
        <li>
          <strong>What stays public:</strong> amounts, names and addresses. The contract needs them to check and settle every cycle.
        </li>
        <li>
          <strong>Your key is never stored.</strong> It&apos;s derived from your signature each time you unlock, so it lives only in your
          browser for that session.
        </li>
      </List>

      <H2 id="currencies">Currencies</H2>
      <P>
        USDC and EURC net independently. Owing 5 USDC and being owed 5 EURC is still a 5 USDC debt. Converting across currencies through
        StableFX is on the roadmap.
      </P>
    </>
  );
}
