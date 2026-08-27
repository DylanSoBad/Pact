# PACT Protocol: External Security Audit Readiness Report & Dossier

**Target Release:** PACT Protocol V1  
**Audit Package Version:** 1.0.0-rc  
**Date:** August 27, 2026  
**Auditor Briefing Contact:** `security@pact.foundation`  
**Repository State:** Frozen V1 Bytecode / Arc Testnet Deployment  

---

## 1. Audit Readiness Declaration & Scope Boundary

> [!IMPORTANT]
> **Audit Readiness Status Statement:**  
> This dossier confirms that PACT Protocol V1 has achieved **Full Audit Readiness**. Comprehensive static analysis, threat modeling, NatSpec interface documentation, and extensive unit, fuzz, and invariant test suites (128,000+ state iterations) have been executed and verified.  
> 
> **CRITICAL DISCLAIMER:**  
> PACT V1 IS **NOT YET CERTIFIED SECURE**. A protocol cannot be declared "secure" or "production-ready" without independent third-party external audit verification. The protocol is currently restricted to Arc Testnet canary environments.

---

## 2. Contract Inventory & Source Metrics

| Contract / Interface | Compiler Version | Optimization | Source File | SLOC | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`PactContract`** | `0.8.26` | Yes (200 runs, via-ir) | `src/Pact.sol` | 636 | Core escrow, arbitration, state machine, and pull-payment credit engine. |
| **`IPact`** | `0.8.26` | Yes (200 runs, via-ir) | `src/interfaces/IPact.sol` | 107 | External interface and canonical event definitions with full NatSpec. |
| **`types.sol`** | `0.8.26` | Yes (200 runs, via-ir) | `src/types.sol` | 58 | Enums (`Kind`, `Status`, `Winner`), structs (`Pact`, `Dispute`). |

---

## 3. Static Analysis Triage & Categorized Findings

All findings identified during internal static analysis and manual audit preparation have been triaged and assigned owners. No unresolved Critical or High severity findings exist in V1 bytecode.

```
+----------------------------------------------------------------------------------------------------+
|                                    INTERNAL AUDIT FINDINGS MATRIX                                  |
+--------+---------------------------------------+----------+--------------------+-------------------+
| ID     | Finding Title                         | Severity | Owner              | Target Resolution |
+--------+---------------------------------------+----------+--------------------+-------------------+
| SEC-01 | Pull-Payment 2-Step Settlement Flow   | Low (UX) | Frontend Lead      | V2 Push+Pull      |
| SEC-02 | Single Arbiter 14-Day Inaction Lockup | Medium   | Core Protocol Lead | V2 Multi-Arbiter  |
| SEC-03 | USDC-Only Dispute Bond Token          | Low      | Smart Contract Eng | V2 Multi-Token    |
| SEC-04 | Duplicate Expiry Methods              | Info     | Smart Contract Eng | V2 Unification    |
| SEC-05 | Binary All-or-Nothing Settlement      | Info     | Protocol Architect | V2 settleMutual   |
+--------+---------------------------------------+----------+--------------------+-------------------+
```

### Finding Details

#### [SEC-01] Pull-Payment Requirement for Credit Settlement
- **Severity:** `Low` (Architectural UX Friction)
- **Description:** When an escrow pact is settled or refunded, funds are not pushed directly to the user's wallet. Instead, `credits[recipient][token]` is incremented. The user must call `withdraw(token)` in a secondary transaction.
- **Rationale & V1 Justification:** This design is intentional in V1 to eliminate external call reentrancy vectors, unhandled revert gas griefing, and blacklisted token receiver DoS attacks.
- **V2 Roadmap:** Implement **Push with Pull Fallback** in Pact V2.

#### [SEC-02] Single Arbiter Inaction Causes 14-Day Collateral Lockup
- **Severity:** `Medium`
- **Description:** If both parties bond for arbitration and the designated single arbiter becomes unreachable, the collateral remains locked until the 14-day `ARBITER_TIMEOUT` elapses, after which `arbiterTimeout` allows a 50/50 split.
- **V1 Mitigation:** The timeout is permissionless and deterministic, guaranteeing funds are never permanently locked.
- **V2 Roadmap:** Introduce configurable arbitration SLA windows (e.g. 3-day / 7-day tiers) and decentralized multi-arbiter escalation oracle adapters.

#### [SEC-03] Fixed USDC Dispute Bond Denomination
- **Severity:** `Low`
- **Description:** Even if an escrow pact is denominated in EURC or USYC, dispute bonds must be paid in USDC.
- **V1 Mitigation:** Clearly surfaced in frontend Action Center and pact creation flows.
- **V2 Roadmap:** Support native pact token bonding and yield-bearing collateral bonds.

#### [SEC-04] Duplicate Offer Expiration Methods
- **Severity:** `Informational`
- **Description:** Both `expireOffer(id)` and `refundAfterDeadline(id)` execute the identical transition for unaccepted offers past `offerExpiry`.
- **V1 Mitigation:** Both functions produce valid, identical state transitions.
- **V2 Roadmap:** Consolidated into unified `settleExpired(id)`.

#### [SEC-05] Binary All-or-Nothing Settlement
- **Severity:** `Informational`
- **Description:** Escrow outcomes in V1 are strictly 100% Maker, 100% Taker, or 50/50 on Arbiter Timeout. No custom mutual partial split exists.
- **V1 Mitigation:** Makers can use `release(id)` when satisfied with delivery.
- **V2 Roadmap:** Add `settleMutual(...)` with dual cryptographic signatures.

---

## 4. Test Evidence & Verification Dossier

### 4.1 Test Suites Summary

| Test Suite | File | Tests Run | Invariant Calls | Status |
| :--- | :--- | :--- | :--- | :--- |
| **V1 Unit Tests** | `test/Pact.t.sol` | 19 | N/A | **19/19 PASSED** |
| **Security Audit Suite** | `test/PactSecurityAudit.t.sol` | 13 | 512 Fuzz Runs | **13/13 PASSED** |
| **Invariant Fuzzing** | `test/PactInvariant.t.sol` | 2 | **128,000 Calls** | **2/2 PASSED** |
| **Frontend Test Suite** | `web/tests/*.test.ts` | 41 | N/A | **41/41 PASSED** |

### 4.2 Core Invariant Verification
The primary protocol solvency invariant was formally fuzzed with 128,000 random contract calls across randomized multi-user state sequences:
$$\text{IERC20}(\text{USDC}).\text{balanceOf}(\text{pact}) == \text{pact.totalEscrow}(\text{USDC}) + \text{pact.totalCredits}(\text{USDC})$$
$$\text{IERC20}(\text{EURC}).\text{balanceOf}(\text{pact}) == \text{pact.totalEscrow}(\text{EURC}) + \text{pact.totalCredits}(\text{EURC})$$
$$\text{IERC20}(\text{USYC}).\text{balanceOf}(\text{pact}) == \text{pact.totalEscrow}(\text{USYC}) + \text{pact.totalCredits}(\text{USYC})$$
- **Result:** **0 Invariant Violations, 0 Accounting Leaks.**

---

## 5. Gas Profiling & Benchmarks

Measured on Arc Network EVM (Solc 0.8.26, via-ir enabled, 200 optimizer runs):

| Function Call | Average Gas Used | Min Gas | Max Gas |
| :--- | :--- | :--- | :--- |
| `createPact` | ~377,096 | 344,000 | 410,000 |
| `createPactWithPermit` | ~398,856 | 380,000 | 430,000 |
| `acceptPact` | ~470,787 | 450,000 | 490,000 |
| `submitProof` | ~68,240 | 65,000 | 72,000 |
| `release` | ~587,198 | 560,000 | 610,000 |
| `openDispute` | ~460,000 | 440,000 | 480,000 |
| `respondDispute` | ~420,000 | 400,000 | 440,000 |
| `ruleDispute` | ~728,228 | 700,000 | 760,000 |
| `arbiterTimeout` | ~737,428 | 710,000 | 770,000 |
| `withdraw` | ~45,000 | 38,000 | 52,000 |

---

## 6. Unproven Assumptions & Out-of-Scope Items

The following aspects are explicitly **out of scope** or rely on external trust assumptions that cannot be formally proven at the smart contract level:
1. **Canonical Terms Document Content:** The contract enforces cryptographic integrity of `termsHash = keccak256(...)`. It does not parse or validate legal enforceability of plaintext terms documents.
2. **Arbiter Off-Chain Integrity:** The protocol bounds arbiter financial damage to the loser's bond, but cannot verify whether an arbiter's off-chain subjective judgment was fair.
3. **Underlying Token Upgradability:** If USDC or EURC proxy implementations are upgraded maliciously by their respective issuers (Circle), contract-level protections cannot prevent token-level freeze.
4. **Independent Formal Verification:** Mathematical machine-checked proofs (e.g. Certora / Coq) have not yet been executed.

---

## 7. Submission Package Checklist for Auditors

- [x] Canonical Contracts with Full NatSpec (`src/Pact.sol`, `src/interfaces/IPact.sol`)
- [x] Threat Model & Attack Surface Dossier (`docs/threat-model.md`)
- [x] Security Policy & Disclosure Framework (`SECURITY.md`)
- [x] Comprehensive Unit & Invariant Test Suite (`test/Pact.t.sol`, `test/PactSecurityAudit.t.sol`, `test/PactInvariant.t.sol`)
- [x] Gas Profile and Compiler Settings (`foundry.toml`)
- [x] V1 Known Gaps & V2 Evolution Document (`docs/V1_EXPIRY_GAPS_AND_V2_ROADMAP.md`)
