import type { Metadata } from "next";
import { C, Callout, Code, DocTitle, H2, List, P, Table } from "@/components/docs/ui";
import { net } from "@/lib/config";

export const metadata: Metadata = { title: "Smart contract" };

export default function Page() {
  return (
    <>
      <DocTitle
        eyebrow="Design"
        title="Smart contract"
        lead="Setoff.sol: one contract, no owner, no upgrades. It stores IOUs, holds deposits, verifies and applies cycles, resolves disputes by agreement, tracks credit lines, and applies opt-in USDC↔EURC swaps."
      />

      <H2 id="iou">The IOU</H2>
      <Code lang="solidity">{`
struct IOU {
    address debtor;
    address creditor;
    address token;     // USDC or EURC, fixed at deployment
    uint128 amount;    // 6 decimals
    uint64  deadline;  // last timestamp it may settle
    uint256 nonce;     // makes otherwise identical IOUs distinct
    bytes32 ref;       // invoice reference, carried into events
}
// id = EIP-712 hash, domain ("Setoff", "1", chainId, contract)
`}</Code>
      <P>
        An IOU&apos;s id is its EIP-712 typed-data hash, so the same struct the debtor signs in their wallet is the key it&apos;s stored under.
        Signatures are checked with OpenZeppelin&apos;s <C>SignatureChecker</C>, which also accepts EIP-1271 smart-contract wallets.
      </P>

      <H2 id="functions">Functions</H2>
      <Table
        head={["Function", "Who", "What it does"]}
        rows={[
          [<C key="1">submit(iou, signature)</C>, "anyone", "Adds a debtor-authorised IOU to the pool. The debtor may submit with an empty signature."],
          [<C key="2">cancel(id)</C>, "debtor or creditor", "Withdraws (debtor) or rejects (creditor) a pending IOU."],
          [<C key="3">deposit(token, amount)</C>, "anyone", "Moves tokens in and credits your balance."],
          [<C key="4">withdraw(token, amount)</C>, "balance owner", "Moves tokens out, up to your balance."],
          [<C key="5">settle(ids, amounts, parties, draws, fx)</C>, "anyone", "Applies a cycle: pays each IOU the given amount (partial or full), applies credit draws, nets, then applies opt-in USDC↔EURC swaps. Reverts unless every net debtor is covered and the swaps balance per token."],
          [<C key="5a">dispute(id)</C>, "debtor or creditor", "Freezes an open IOU so no cycle can pay it."],
          [<C key="5b">offer(id, remaining)</C>, "debtor or creditor", "Proposes what is still owed on a disputed IOU. Matching offers reopen it at that amount; 0 cancels it."],
          [<C key="5f">setFxPreference(sell, buy, minRate)</C>, "anyone", "Opts in to having your leftover sell converted into buy in cycles, never below minRate (buy per sell, 1e6 = 1:1). 0 opts out."],
          [<C key="5c">setCreditLine(borrower, token, limit)</C>, "lender", "Lets a borrower overdraw up to limit, funded from the lender's deposit. 0 stops new draws."],
          [<C key="5d">repay(lender, token, amount)</C>, "borrower", "Repays credit from the borrower's balance."],
          [<C key="6">getIOU(id)</C>, "view", "Returns the IOU (current amount), its status, the last cycle that paid it, and how much is paid."],
          [<C key="6a">creditLine(lender, borrower, token)</C>, "view", "Returns the limit and how much is drawn and not yet repaid."],
          [<C key="7">hashIOU(iou)</C>, "view", "The EIP-712 id, for wallets and solvers."],
        ]}
      />

      <H2 id="settle">What settle checks</H2>
      <List>
        <li>The cycle has between 1 and 256 IOUs, with one pay amount for each.</li>
        <li>Each credit draw is within the line&apos;s remaining limit and the lender&apos;s deposit. Draws move money from lender to borrower before netting.</li>
        <li><C>parties</C> is strictly ascending, which proves it has no duplicates.</li>
        <li>Each IOU is open (not disputed) and unexpired, and each pay amount is more than 0 and at most what is still owed. Paying the remainder marks it settled. Listing an id twice can split a payment but can never overpay.</li>
        <li>Every debtor and creditor is found in <C>parties</C>. Nets are accumulated per party per token.</li>
        <li>Each negative net is covered by that party&apos;s deposit, otherwise the call reverts with <C>InsufficientDeposit(account, token, needed, available)</C>.</li>
      </List>

      <H2 id="events">Events</H2>
      <Code lang="solidity">{`
event IOUSubmitted(bytes32 indexed id, address indexed debtor, address indexed creditor,
                   address token, uint128 amount, uint64 deadline, uint256 nonce, bytes32 ref);
event IOUCancelled(bytes32 indexed id, address indexed by);
event IOUSettled(bytes32 indexed id, uint64 indexed cycle, address indexed debtor,
                 address creditor, address token, uint128 amount, uint128 remaining, bytes32 ref);
event IOUDisputed(bytes32 indexed id, address indexed by);
event IOUOffer(bytes32 indexed id, address indexed by, uint128 amount);
event IOUResolved(bytes32 indexed id, uint128 remaining);
event CreditLineSet(address indexed lender, address indexed borrower, address indexed token, uint128 limit);
event CreditDrawn(uint64 indexed cycle, address indexed borrower, address indexed lender, address token, uint128 amount);
event CreditRepaid(address indexed borrower, address indexed lender, address indexed token, uint128 amount);
event NetPosition(uint64 indexed cycle, address indexed account, address indexed token, int256 net);
event CycleSettled(uint64 indexed cycle, address indexed solver, uint256 iouCount,
                   uint256[] gross, uint256[] netFunded);
event Deposited(address indexed account, address indexed token, uint256 amount);
event Withdrawn(address indexed account, address indexed token, uint256 amount);
`}</Code>

      <H2 id="guarantees">Guarantees</H2>
      <List>
        <li><strong>Always fully backed.</strong> The contract always holds exactly the tokens its ledger says it owes, for each currency.</li>
        <li><strong>Nothing is created or lost.</strong> In every cycle, what net debtors pay equals what net creditors receive.</li>
        <li><strong>Never more than the bills.</strong> The money used in a cycle can never exceed the total of the bills it settles.</li>
        <li><strong>Never overpaid.</strong> Across partial payments, disputes and credit draws, no bill is ever paid more than its amount.</li>
        <li><strong>Bad input is rejected.</strong> Forged signatures, duplicate or expired bills, underfunded debtors and malformed cycles all revert.</li>
      </List>
      <P>
        These are enforced by the contract and checked by its test suite, including fuzz and stateful invariant tests, in the{" "}
        <a className="text-primary hover:underline" href="https://github.com/Anshv784/setoff/tree/main/contracts/test" target="_blank" rel="noreferrer">repository</a>.
      </P>

      <H2 id="security">Security model</H2>
      <List>
        <li><strong>No admin.</strong> There is no owner, pause, upgrade or sweep function. Nobody, including whoever deployed it, can move deposits.</li>
        <li><strong>Your balance only drops for bills you authorised:</strong> your signature, or your own transaction.</li>
        <li><strong>The solver is untrusted.</strong> It can choose which IOUs to include, how much of each to pay, and which credit to draw. It cannot add debts, pay more than is owed, exceed a credit line, or overdraw anyone.</li>
        <li><strong>Disputes need both sides.</strong> Only matching offers from the debtor and creditor change a disputed bill.</li>
        <li><strong>Credit risk stays with the lender</strong> who chose to grant it. Draws come only from that lender&apos;s own deposit.</li>
        <li><strong>The token list is fixed at deployment</strong> (USDC, EURC), so there are no fee-on-transfer or malicious-token surprises.</li>
      </List>
      <Callout kind="warn" title="Unaudited">
        Setoff has not been audited. Use small amounts.
      </Callout>

      <H2 id="address">Deployment</H2>
      <P>
        Current network: <strong>{net.name}</strong>, contract <C>{net.setoff}</C>.
      </P>
    </>
  );
}
