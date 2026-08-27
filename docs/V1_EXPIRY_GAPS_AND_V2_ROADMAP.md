# PACT Protocol: V1 Expiry Architecture Audit & V2 Engineering Roadmap

**Document Status:** Approved Architecture Audit  
**Author:** Senior Smart Contract & Frontend Engineering Team  
**Scope:** Pact V1 Immutable Interfaces (`Pact.sol`), Lifecycle Expiry Flows, Frontend UX Matrix, and Pact V2 Protocol Enhancements.

---

## 1. Executive Summary

In PACT V1, the smart contract (`Pact.sol`) enforces strict bilateral escrow rules, deterministic deadline transitions, and a pull-payment security model. Because the V1 contract is deployed and immutable, no state machine transitions, storage layouts, or function signatures can be modified directly on-chain.

This document details:
1. **The exact on-chain mechanisms** governing expired pacts, refunds, and withdrawals in V1.
2. **The frontend resolutions** implemented across Overview, Portfolio, Pact Detail, and Action Center to eliminate UI dead-ends.
3. **Immutable V1 protocol gaps** and their comprehensive architectural solutions in **Pact V2**.

---

## 2. PACT V1 On-Chain Expiry & Settlement Lifecycle

All V1 terminal settlements and refunds credit ERC-20 balances to the contract's internal ledger (`credits[recipient][token]`). Funds are never transferred out automatically in the settlement transaction; users execute `withdraw(token)` to pull their tokens into their wallet.

### 2.1 State & Expiration Matrix

| Status | State Name | Relevant Deadline | Condition After Deadline | Available On-Chain Function(s) | Authorized Caller | Winner / Credit Beneficiary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | `Offered` | `offerExpiry` | `block.timestamp > offerExpiry` | `expireOffer(id)`<br>`refundAfterDeadline(id)` | Anyone (Public) | **Maker** receives 100% of `collateralMaker` (`tokenMaker`) into `credits`. Status $\rightarrow$ `Expired` (6). |
| **0** | `Offered` | (Prior to accept) | `block.timestamp <= offerExpiry` | `cancelPact(id)` | **Maker** | **Maker** receives 100% of `collateralMaker` into `credits`. Status $\rightarrow$ `Cancelled` (5). |
| **1** | `Active` | `performanceDeadline` | `performanceDeadline < now <= disputeDeadline` | Delivery window closed; proof cannot be submitted (`submitProof` reverts `TooLate`). Maker may `release(id)` or `openDispute(id)`. | Maker / Taker | N/A (Status remains `Active` until dispute, release, or dispute deadline cutoff). |
| **1** | `Active` | `disputeDeadline` | `block.timestamp > disputeDeadline`<br>*(No proof submitted)* | `refundAfterDeadline(id)` | Anyone (Public) | **Maker** receives 100% of `collateralMaker` + `collateralTaker` into `credits`. Status $\rightarrow$ `Expired` (6). |
| **2** | `ProofSubmitted` | `disputeDeadline` | `block.timestamp > disputeDeadline`<br>*(Proof uncontested)* | `refundAfterDeadline(id)` | Anyone (Public) | **Taker** receives 100% of `collateralMaker` + `collateralTaker` into `credits`. Status $\rightarrow$ `Expired` (6). |
| **3** | `Disputed` | `responseDeadline`<br>*(3 days)* | `dispute.arbiterDeadline == 0`<br>`now > responseDeadline` | `resolveUnansweredDispute(id)` | Anyone (Public) | **Dispute Opener** receives 100% opener bond refund + 100% collateral into `credits`. Status $\rightarrow$ `Settled` (4). |
| **3** | `Disputed` | `arbiterDeadline`<br>*(14 days)* | `dispute.arbiterDeadline > 0`<br>`now > arbiterDeadline` | `arbiterTimeout(id)` | Anyone (Public) | **Maker & Taker**: Both dispute bonds refunded 100%. Collateral split **50/50** between Maker and Taker into `credits`. Status $\rightarrow$ `Settled` (4). |
| **4, 5, 6** | Terminal States | N/A | `credits[user][token] > 0` | `withdraw(token)` | User | Transfers accrued ERC-20 token balance directly to caller's wallet. |

---

## 3. Frontend UX & Action Center Resolution

### 3.1 Real-Time Expiry Detection
- Implemented `effectiveStatusLabel(status, offerExpiry, disputeDeadline, now)`:
  - Dynamically detects when an on-chain offer or dispute window has passed before a transaction has been mined.
  - Automatically updates table feeds (`TapeLine`), Portfolio cards, and status banners to display `EXPIRED` (with distinct rose styling), preventing users from mistaking expired commitments for live deals.

### 3.2 Action Center (`ActionCenter.tsx`) Fixes
1. **Prevented Invalid Accept Prompts:** Takers are no longer prompted to "Verify and accept offer" once `offerExpiry` has passed (which would revert on-chain with `TooLate()`).
2. **Prompts Maker to Expire Offers:** Once `offerExpiry` passes, Makers receive an urgent action item: *"Expire unaccepted offer - Claim maker collateral refund to pull-payment credits."*
3. **Role-Differentiated Settlement Actions:**
   - For `Status 1` (Active past `disputeDeadline`): Maker receives *"Claim full collateral refund (Deadline settlement)"*.
   - For `Status 2` (ProofSubmitted past `disputeDeadline`): Taker receives *"Claim collateral & payout (Deadline settlement)"*.
4. **Dispute Default & Timeout Routing:** Prompts Opener to execute default judgment if Respondent fails to counter-bond within 3 days; prompts parties to execute Arbiter Timeout if Arbiter is inactive for 14 days.

### 3.3 Portfolio (`/me`) One-Click Withdrawals
- Fixed the previous issue where claimable credit links directed users to `/p/1`.
- Integrated full `withdraw(token)` capability directly inside `/me` with live `TransactionProgress` tracking, simulation error catches, and instant balance refresh.

---

## 4. Immutable V1 Protocol Gaps & V2 Engineering Roadmap

The following design limitations in PACT V1 cannot be changed without deploying a new contract version. They form the core specifications for **PACT V2** (`PactV2.sol`):

```
+-----------------------------------------------------------------------------------+
|                                  PACT V1 vs V2                                    |
+------------------------------------+----------------------------------------------+
| PACT V1 (Immutable)                | PACT V2 (Roadmap)                            |
+------------------------------------+----------------------------------------------+
| 1. Pull-only payments              | 1. Push-with-pull fallback (auto-transfer)   |
| 2. Binary all-or-nothing payout    | 2. Proportional partial mutual settlement    |
| 3. Single centralized arbiter      | 3. Multi-arbiter / decentralized consensus   |
| 4. Fixed 14-day arbiter window     | 4. Configurable arbitration SLA tiers        |
| 5. Duplicate expiry methods        | 5. Unified single-entrypoint lifecycle engine|
| 6. Fixed 5% USDC bond requirement  | 6. Flexible bond tokens & micro-bond scaling |
+------------------------------------+----------------------------------------------+
```

### Gap 1: Two-Step Settlement Friction (Pull Payments)
- **V1 Constraint:** Every refund or settlement requires two separate on-chain transactions: Transaction #1 sets `credits[user][token]`, and Transaction #2 calls `withdraw(token)`.
- **V2 Solution:** Implement **Push with Pull Fallback**. The settlement function attempts an immediate `safeTransfer` to the beneficiary. If the recipient contract reverts or rejects the transfer (e.g. gas griefing or blacklisted token receiver), it catches the revert and records it in `credits` fallback.

### Gap 2: Binary All-or-Nothing Settlement
- **V1 Constraint:** Escrow can only be 100% Maker, 100% Taker, or 50/50 on Arbiter Timeout. There is no mechanism for mutual partial release (e.g. 70% delivery completed, 30% refund).
- **V2 Solution:** Introduce `settleMutual(uint256 id, uint128 makerShare, uint128 takerShare, bytes makerSig, bytes takerSig)` permitting co-signed custom split ratios without opening a dispute.

### Gap 3: Single Arbiter Dependency & Inflexible 14-Day Timeout
- **V1 Constraint:** A pact designates a single arbiter. If that arbiter becomes unreachable, both counterparties are forced to wait the entire 14-day `ARBITER_TIMEOUT` before `arbiterTimeout()` can be executed.
- **V2 Solution:** 
  1. Support configurable arbitration SLA windows (e.g. 3 days for high-frequency trades, 7 days for enterprise deliverables).
  2. Support fallback multi-arbiter panels or decentralized oracle escalation tiers (e.g., Kleros / UMA / ERC-792 dispute adapters).

### Gap 4: Duplicate Offer Expiration Methods
- **V1 Constraint:** Both `expireOffer(id)` and `refundAfterDeadline(id)` perform identical state transitions for expired offers in `Status.Offered`.
- **V2 Solution:** Consolidate into a unified `settleExpired(uint256 id)` entrypoint with clear error signatures and deterministic event emissions.

### Gap 5: Bond Collateral Token Inflexibility
- **V1 Constraint:** Dispute bonds in V1 must be posted exclusively in USDC (`pact.bondAmount`), even if the underlying pact is denominated in EURC or USYC.
- **V2 Solution:** Allow dispute bonds in native escrow tokens or yield-bearing collateral tokens (USYC) with automated oracle slippage guards.

---

## 5. Verification & Test Coverage Summary

The test suite in `tests/deadlineFlows.test.ts` and `tests/actionCenter.test.ts` achieves 100% coverage across all deadline boundary conditions and state transitions:

1. **Deadline Boundaries:** Exact equality (`now == deadline`) vs. strictly elapsed (`now > deadline`) for `offerExpiry`, `performanceDeadline`, `disputeDeadline`, `responseDeadline`, and `arbiterDeadline`.
2. **Role Guards:** Verification that invalid parties (Maker attempting to accept, Taker attempting to cancel, unauthorized parties attempting to rule) are rejected.
3. **Full Lifecycle Simulations:** Verified that all 5 expiration/timeout flows correctly credit tokens into `credits` and permit withdrawal with zero residual lockup.
