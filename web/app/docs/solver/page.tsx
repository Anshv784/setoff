import type { Metadata } from "next";
import { C, Callout, Code, DocTitle, H2, List, P } from "@/components/docs/ui";

export const metadata: Metadata = { title: "Solver" };

export default function Page() {
  return (
    <>
      <DocTitle
        eyebrow="Design"
        title="Solver"
        lead="The solver picks which pending bills go into the next cycle. It has no special power: the contract re-checks everything."
      />
      <H2 id="problem">The problem it solves</H2>
      <P>
        If every net debtor has deposited enough, every pending IOU can settle. Usually some haven&apos;t. Then the solver must choose a
        subset of IOUs such that every party&apos;s net position within that subset is covered by its deposit, while clearing as much face value
        as possible. That is a knapsack-style problem, so the solver uses a fast greedy repair that is close to optimal.
      </P>
      <H2 id="algorithm">Algorithm</H2>
      <List>
        <li><strong>Start</strong> with every pending IOU that isn&apos;t about to expire (60 s margin), most urgent first, capped at 256.</li>
        <li>
          <strong>Repair:</strong> while some net debtor is short, try dropping each of <em>that</em> debtor&apos;s IOUs and keep the drop that
          leaves the <strong>least total shortfall across everyone</strong>. Ties go to the smaller IOU.
        </li>
        <li><strong>Refill:</strong> retry every dropped IOU, largest first, keeping any that still fit.</li>
        <li>
          <strong>FX (opt-in):</strong> pair parties who opted in and have opposite USDC/EURC leftovers, at a reference rate both minimums
          accept. Re-select with those swaps, and keep them only if the cycle is still fully funded and clears at least as much.
        </li>
        <li>
          <strong>Credit:</strong> for each bill still left out, check whether the debtor has credit lines whose lenders have room and spare
          deposit. If together they cover the gap, add the bill and plan the draws (one per lender).
        </li>
        <li>
          <strong>Partial:</strong> finally, pay part of each remaining bill, up to what its debtor can still cover. The rest stays open.
        </li>
      </List>
      <Callout title="Why look at everyone, not just the debtor">
        The obvious move is to drop the smallest bill that covers the shortfall. But that bill may be offsetting someone else&apos;s debt, and
        removing it can make the whole cycle fall apart. Looking at the total shortfall across everyone avoids that.
      </Callout>
      <H2 id="quality">How close to perfect</H2>
      <P>
        On small random pools, where every possible combination can be checked, the solver clears about 93% of the best possible value and
        finds the exact best answer most of the time. Every cycle it proposes is fully funded, and the contract checks that again anyway.
      </P>
      <H2 id="settling">Settling</H2>
      <P>
        The solver simulates first, then sends <C>Memo.memo(Setoff, settle(ids, parties), keccak(&quot;setoff:cycle:N&quot;), summary)</C> from
        its wallet. The cycle summary, for example &quot;Setoff cycle 3: 13 IOUs, 11.96 USDC cleared with 4.1 USDC&quot;, is indexed onchain by
        Arc&apos;s Memo contract. It reads the head block uncached, so bills posted seconds earlier are included.
      </P>
      <Code lang="bash">{`
cd solver
SETOFF_NETWORK=mainnet SOLVER_PK=0x... npm run solve
`}</Code>
      <H2 id="anyone">Anyone can run one</H2>
      <P>
        <C>settle</C> is permissionless and the pool is public, so if the hosted solver stops, anyone can run the command above and settle the
        cycle. A dishonest solver can only leave bills out, and those wait for the next cycle.
      </P>
    </>
  );
}
