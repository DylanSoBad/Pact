# PACT Protocol Security Policy & Disclosure Guidelines

**Version:** 1.0 (Audit-Ready Baseline)  
**Status:** Pre-Audit Canary / Testnet Deployment  
**Ecosystem:** Arc Network (EVM Equivalent)  

---

## 1. Security Philosophy & Audit Status Declaration

The PACT Protocol enforces trust-minimized, bilateral escrow agreements with deterministic dispute arbitration. 

> [!CAUTION]
> **Audit Status Notice:** While PACT V1 has completed extensive internal security engineering, static analysis triage, and formal invariant fuzzing (128,000+ state iterations), **PACT V1 HAS NOT YET COMPLETED AN INDEPENDENT EXTERNAL SECURITY AUDIT**. It is currently deployed on Arc Testnet for integration and canary testing. Do not commit production mainnet capital of real value until independent audit reports are published.

---

## 2. Scope & Target Contracts

| Contract / Surface | File Path | Scope Status | Description |
| :--- | :--- | :--- | :--- |
| **`PactContract` (V1)** | `contracts/src/Pact.sol` | **In Scope** | Core escrow, arbitration, state machine, and pull-payment credit engine. |
| **`IPact`** | `contracts/src/interfaces/IPact.sol` | **In Scope** | Protocol interface and event specifications. |
| **`types.sol`** | `contracts/src/types.sol` | **In Scope** | Enums, structs, and storage schema. |
| **Web Frontend** | `web/` | **Secondary** | UI execution hubs, EIP-712 / EIP-2612 signatures, client formatting. |
| **Third-Party Tokens** | USDC, EURC, USYC | **Out of Scope** | External ERC-20 token contracts. |

---

## 3. Threat Model & Security Invariants

PACT V1 is architected around nine formal security guarantees:

1. **Strict Balance Conservation Invariant:**  
   $$\text{IERC20}(token).\text{balanceOf}(\text{pact}) \ge \text{totalEscrow}[token] + \text{totalCredits}[token]$$
   Every token held by the contract is accounted for with zero floating or unassigned balance.
2. **Pull-Payment Protection:**  
   All settlement, refund, and arbitration actions allocate internal credits. No external push transfers occur during settlement, eliminating gas-griefing and reentrancy attack surfaces.
3. **Double-Settlement Impossibility:**  
   Every pact transitions monotonically from non-terminal states (`Offered`, `Active`, `ProofSubmitted`, `Disputed`) to terminal states (`Settled`, `Cancelled`, `Expired`). Collateral balances are zeroed atomically.
4. **Deterministic Timeouts & Liveness Escape Hatches:**  
   Permissionless functions (`expireOffer`, `refundAfterDeadline`, `resolveUnansweredDispute`, `arbiterTimeout`) prevent funds from being permanently locked by inactive counterparties or unresponsive arbiters.
5. **Two-Tier Pause Defense:**  
   - `pauseIntake()`: Pauses new pact creation immediately (callable by `pauseGuardian` or `adminSafe`).
   - `pauseAll()`: Pauses operational state changes with a hardcoded **7-day maximum duration**.
   - `withdraw()` and `refundAfterDeadline()` are **immune to pause**, guaranteeing user fund recovery under all emergency conditions.
6. **No Native Asset Exposure:**  
   PACT V1 exclusively interacts with allowlisted ERC-20 tokens (USDC, EURC, USYC) and rejects any native gas token transfers.
7. **EIP-2612 Permit Atomicity:**  
   Permit signatures are consumed atomically during creation, acceptance, and dispute bonding. If front-run, the transactions gracefully fall back to pre-approved allowances.
8. **Dispute Bond Economic Security:**  
   A minimum 5% dispute bond (floor 1 USDC) prevents spam disputes. Arbiter fees cannot exceed `min(arbiterFeeCap, bondAmount)`.
9. **Role Authorization Integrity:**  
   Only designated makers, takers, and arbiters can execute role-restricted operations.

---

## 4. Responsible Vulnerability Disclosure

If you discover a security vulnerability, we request that you disclose it responsibly to our security team.

### Submission Guidelines
- **Email:** `security@pact.foundation` (or via private security portal)
- **PGP Key:** `0x7A4F...B821` (Key fingerprint available on official DNS TXT record)
- **Report Content:**
  - Concise description of the vulnerability and attack vector.
  - Affected contract, function, or component.
  - Minimal reproducible Proof-of-Concept (PoC) in Foundry (`test/PactPoC.t.sol`).
  - Estimated impact and recommended remediation.
- **Do Not Include:** Sensitive private keys, seed phrases, or production transaction signatures.
- **Rules of Engagement:** Do not exploit vulnerabilities against live testnet/mainnet contracts or execute denial-of-service attacks.

---

## 5. Bug Bounty Framework & Reward Tiers

Vulnerability reports are evaluated based on the [CVSS v3.1](https://www.first.org/cvss/) standard and the following reward matrix:

| Severity Tier | Impact Definition | Bounty Reward Range |
| :--- | :--- | :--- |
| **Critical** | Direct theft of user escrow funds, permanent fund freezing without escape hatch, or total invariant violation. | **$25,000 – $50,000** |
| **High** | Temporary fund freeze requiring admin intervention, broken state machine preventing valid settlement, or unauthorized arbiter fee drain. | **$10,000 – $25,000** |
| **Medium** | Griefing attacks imposing excessive gas on counterparties, precision loss in bond/fee arithmetic, or EIP-2612 front-running griefing. | **$2,500 – $10,000** |
| **Low** | Minor UI desynchronization, informational accounting discrepancies, or missing NatSpec definitions. | **$500 – $2,500** |

---

## 6. Incident Response & Emergency Action Plan

1. **Detection & Triage:** Security operations team verifies the report within **2 hours**.
2. **Intake Freeze:** Hot `pauseGuardian` triggers `pauseIntake()` to halt new escrow agreements.
3. **Operational Freeze:** If active agreements are at risk, `pauseGuardian` executes `pauseAll()` (arms 7-day pause window).
4. **Multisig Escalation:** `adminSafe` (Multi-Signature Gnosis Safe) convenes to review bytecode-level remediation, coordinate canary deployment, or initiate migration.
5. **Public Post-Mortem:** Comprehensive post-mortem published within 72 hours of patch deployment.
