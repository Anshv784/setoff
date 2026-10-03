# Security review

A self-review of `contracts/src/Setoff.sol`. This was not an external audit. It covers the checks listed below, the test suites, and one static-analysis run.

## What was done

- **Static analysis.** Slither 0.11 was run with all 102 detectors on `src/Setoff.sol`. It reported 5 results and none were high or medium. One was fixed (an uncached array length). The others are accepted:
  - `_partyIndex` has an uninitialized `lo`. It is meant to start at 0.
  - `submit` and `_applyIOU` compare against `block.timestamp` for deadlines. A shift of a few seconds doesn't matter for a deadline.
  - `settle` has a cyclomatic complexity of 14.
- **Tests.** There are 44 contract tests: unit, fuzz, and stateful invariant tests. The fuzz tests run 1,000 times each. The invariant tests have 11 handler actions and fail on any revert. They check that:
  - the contract always holds exactly what its ledger owes (`solvent`)
  - net movement never exceeds gross (`netNeverExceedsGross`)
  - no bill is paid beyond its amount (`neverOverpaid`)
- **Manual review** against the checklist below.

## Checklist

| Area | Finding |
|---|---|
| Reentrancy | `withdraw` updates the balance before transferring. `deposit` pulls tokens before crediting. `settle` makes no external calls. Tokens are a fixed allowlist (USDC and EURC) set in the constructor. |
| Value conservation | `settle` only moves balances inside the ledger. Each token's nets sum to zero by construction, credit draws move balance from a lender to a borrower, and conversions must sell and buy the same total per token or they revert with `FxUnbalanced`. The `solvent` invariant checks this across random sequences. |
| Signatures | IOUs use EIP-712 with chain ID and contract in the domain. The IOU id is its hash, so it can't be submitted twice. A debtor can submit their own IOU without a signature, and anyone else needs the debtor's signature. |
| Access control | `settle` is permissionless. It can only pay bills that are Pending and not expired, up to what is still owed, and only if every party ends up funded. Only a bill's two parties can cancel, dispute or make offers on it. |
| Disputes | A disputed bill is excluded from cycles until both parties offer the same amount. An offer of 0 cancels the bill. |
| Credit | A draw requires a line the lender set, room under its limit, and enough in the lender's deposit. The lender carries the risk, and nothing is drawn from anyone else. |
| Currency conversion | A conversion requires the account's own opt-in for that direction (`fxMinRate > 0`) and a rate at or above that floor. It can only use the leftover difference: the account's net in the sold currency can't go below 0, and its net in the bought currency can't go above 0. That means it can never touch a deposit. Both tokens use 6 decimals. |
| Denial of service | Loops are bounded by the caller's own input. Party lookup is a binary search over a sorted list. A deposit withdrawn just before a cycle makes that cycle revert, and nothing is lost: the solver simulates and retries. |
| Arithmetic | Solidity 0.8 checked math. Amounts are `uint128` and nets `int256`, so they can't overflow. Rates round down, which favours the party's floor. |

## Accepted risks

- **Conversions happen at your floor, not at market.** Anyone can call `settle`, so a cycle can convert your leftover at exactly your minimum rate, and the other opted-in party keeps the difference. Set the minimum close to the market rate. The solver uses a public reference rate (ECB, via frankfurter.dev).
- **Partial payments are chosen by the caller.** A caller can pay any bill in part (never over what is owed) as long as every party stays funded. The bill stays open for the rest.
- **The solver is trusted for liveness, not for funds.** If it is offline, no cycles run. A bad selection only reverts.
- **No upgrades or admin.** Bugs can't be patched in place. A fix means a new deployment.
