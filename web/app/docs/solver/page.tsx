import type { Metadata } from "next";
import { C, Callout, Code, DocTitle, H2, List, P, Table } from "@/components/docs/ui";

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
      </List>
      <Callout title="Why score globally">
        The obvious move is to drop the smallest IOU that covers the shortfall. That fails when the IOU was offsetting someone else&apos;s debt.
        Our test case: B is short 1; dropping B→A (4) cascades until nothing settles, while dropping B→C (6) keeps 11 clearing, which is the
        optimum.
      </Callout>
      <H2 id="quality">Measured quality</H2>
      <Table
        head={["Test", "Result"]}
        rows={[
          ["200 random 10-IOU pools vs. brute force over all 1,024 subsets", "93.1% of optimal value cleared; exact optimum in 175 / 200"],
          ["300 random 12-IOU, 2-currency pools", "Every selection feasible; nets always sum to zero"],
        ]}
      />
      <H2 id="settling">Settling</H2>
      <P>
        The solver simulates first, then sends <C>Memo.memo(Setoff, settle(ids, parties), keccak(&quot;setoff:cycle:N&quot;), summary)</C> from
        its wallet. The cycle summary, for example &quot;Setoff cycle 3: 13 IOUs, 11.96 USDC cleared with 4.1 USDC&quot;, is indexed onchain by
        Arc&apos;s Memo contract. It reads the head block uncached, so bills posted seconds earlier are included.
      </P>
      <Code lang="bash">{`
cd solver
SETOFF_NETWORK=testnet SOLVER_PK=0x... npm run solve
`}</Code>
      <H2 id="anyone">Anyone can run one</H2>
      <P>
        <C>settle</C> is permissionless and the pool is public, so if the hosted solver stops, anyone can run the command above and settle the
        cycle. A dishonest solver can only leave bills out, and those wait for the next cycle.
      </P>
    </>
  );
}
