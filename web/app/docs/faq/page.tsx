import type { Metadata } from "next";
import { DocTitle, H2, P } from "@/components/docs/ui";

export const metadata: Metadata = { title: "FAQ" };

const QA: [string, string, React.ReactNode][] = [
  [
    "lending",
    "Is this a lending platform?",
    "No. Setoff settles debts that already exist, using as little cash as possible, and nobody earns interest. Businesses can optionally grant a trusted partner a credit line, but that's a private promise between those two: draws come only from the lender's own deposit, and the risk stays with them.",
  ],
  ["fx", "I'm owed EURC but owe USDC. Do I have to deposit USDC?", "Not if you opt in. Set a minimum rate under Settings on the Wallet page, and a cycle can swap your EURC leftover with someone who has the opposite, at a reference rate at or above your minimum. If nobody matches or the rate misses your minimum, you fund your USDC as usual."],
  ["audit", "Has the contract been audited?", "Not by a firm. It has had a self-review: Slither with no high or medium findings, unit, fuzz and invariant tests, and a manual checklist. The details and accepted risks are in AUDIT.md in the repo."],
  ["short", "What if I'm short when a cycle runs?", "The cycle pays as much of your bills as your deposit allows, and the rest stays open for the next cycle. If a partner has given you a credit line, the gap can be drawn from it instead."],
  ["dispute", "Can I dispute a bill?", "Yes. Either side can dispute an open bill, which freezes it. Then both of you propose what's still owed; when the amounts match it reopens at that amount (or is cancelled at 0). No one else can decide it for you."],
  [
    "saves",
    "If transfers on Arc already cost a fraction of a cent, what does netting save?",
    "Cash on hand. Without netting you need enough money to pay everything you owe, even if most of it is coming back from the same partners. With netting you only need your net. In a busy network, most of the face value never has to move, and that cash stays in the business. Off-chain, it also means converting and wiring only the net, not every invoice.",
  ],
  [
    "solver-down",
    "What happens if the solver goes down?",
    "Nothing is lost. Deposits stay withdrawable at any time, and settle() is open to anyone. The pool is public onchain and the solver is open source, so anyone can run it with one command. A solver outage only delays settlement.",
  ],
  [
    "solver-cheat",
    "What if the solver is dishonest and changes the pool?",
    "It can't. IOUs are stored in the contract and authorised by their debtors. The solver only sends a list of IOU ids; the contract recomputes every net position from storage and reverts if any debtor is underfunded. The worst a solver can do is leave bills out, and those wait for the next cycle.",
  ],
  [
    "onchain-solver",
    "Why not run the solver onchain?",
    "It wouldn't add security, since the contract already verifies every cycle. It wouldn't add privacy, since onchain data is public either way. And it would be far more expensive: searching subsets onchain hits gas limits quickly, so it would clear less. Computing off-chain and verifying onchain is the same pattern CoW Protocol and UniswapX use.",
  ],
  ["custody", "Who holds my money?", "The contract. It has no owner and no admin function; only you can withdraw your balance, and it only decreases for bills you authorised."],
  [
    "blocklist",
    "USDC can be frozen. Can one frozen address break a cycle?",
    "No. Settlement only updates the internal ledger and never transfers tokens, so a blocklisted address can't make a cycle revert for everyone else.",
  ],
  ["currencies", "Do USDC and EURC net against each other?", "No. Each currency nets separately. Settling the leftover difference through StableFX is on the roadmap."],
  [
    "privacy",
    "Is my data private?",
    "Partly. Invoice notes can be private: turn on private notes under Settings on the Wallet page and they're encrypted so only you and the other party can read them. Amounts, names and addresses are always public, because the contract needs them to settle. Full confidential amounts are possible once Arc's Privacy Sector launches.",
  ],
  ["demo", "Who are the businesses marked \"(demo)\"?", "Example wallets that keep the network active so you can see how it works. They are roles, not real companies. Your own bills settle alongside them."],
];

export default function Page() {
  return (
    <>
      <DocTitle eyebrow="Developers" title="FAQ" lead="Short answers to the questions people ask first." />
      {QA.map(([id, q, a]) => (
        <section key={id}>
          <H2 id={id}>{q}</H2>
          <P>{a}</P>
        </section>
      ))}
    </>
  );
}
