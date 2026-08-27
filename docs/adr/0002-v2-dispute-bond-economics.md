# ADR-0002: PACT V2 Dispute Bond Economics & Multi-Tier Scaling

Status: Proposed for PACT V2. PACT V1 remains active and its 5% fixed bond economics (`max(1 USDC, ceil(notional * 500 / 10_000))`) are strictly unchanged.

---

## 1. Problem Statement & Context

In PACT V1, the dispute bond was designed with a simple linear formula:
$$\text{Bond}_{V1} = \max(1\text{ USDC}, \lceil \text{notionalUSDC} \times 5\% \rceil)$$

### Limitations Identified in V1
1. **Regressive Barrier on Micro-Pacts ($0.50 – $10 USDC)**:
   - For a $1 USDC micro-deal, a $1 USDC bond requires 100% of the deal value to contest a fraudulent counterparty.
   - For a $5 USDC bounty, a $1 USDC bond represents 20% friction.
2. **Excessive Capital Lock on High-Notional Pacts ($100k – $1M+ USDC)**:
   - For a $500,000 commercial agreement, a 5% uncapped bond requires both Maker and Taker to post $25,000 USDC each in dispute bonds ($50,000 total liquidity locked for up to 17 days), deterring legitimate arbitration.

### Objectives for PACT V2
- **Fairness for Micro/Small Pacts**: Lower the barrier for legitimate disputes on small agreements while maintaining a real financial penalty against spam.
- **Capital Efficiency for Large Pacts**: Sub-linear marginal bond rates with an absolute ceiling ($2,500 USDC) to prevent excessive capital lock-up.
- **Strict Anti-Griefing**: Every dispute must require non-zero capital at risk; the loser forfeits 100% of their bond (which covers the arbiter fee, with the remainder awarded to the winning party as compensation).
- **Explicit Decimals**: Dispute bonds are settled strictly in 6-decimal USDC with explicit integer arithmetic and ceil-division.

---

## 2. PACT V2 Bond Formula Specification

Let $N = \text{notionalUSDC}$ expressed in 6-decimal atomic units ($1\text{ USDC} = 1{,}000{,}000$).

$$\text{Bond}_{V2}(N) = \begin{cases} 
\min(N, \max(500{,}000, \lceil N \times 500 / 10{,}000 \rceil)) & \text{if } N < 20{,}000{,}000 \quad (\text{Micro: } < \$20) \\
\lceil N \times 500 / 10{,}000 \rceil & \text{if } 20{,}000{,}000 \le N \le 10{,}000{,}000{,}000 \quad (\text{Standard: } \$20 - \$10\text{k}) \\
\min(2{,}500{,}000{,}000, 500{,}000{,}000 + \lceil (N - 10{,}000{,}000{,}000) \times 200 / 10{,}000 \rceil) & \text{if } N > 10{,}000{,}000{,}000 \quad (\text{Enterprise: } > \$10\text{k})
\end{cases}$$

### Architectural Constants

| Constant | Value (Atomic Units) | Human Value | Purpose |
| :--- | :--- | :--- | :--- |
| `BPS` | `10_000` | 100.00% | Basis point divisor |
| `STANDARD_BOND_BPS` | `500` | 5.00% | Standard tier bond rate |
| `ENTERPRISE_BOND_BPS` | `200` | 2.00% | Marginal enterprise tier bond rate |
| `MICRO_TIER_FLOOR` | `500_000` | 0.50 USDC | Absolute floor for standard micro-pacts |
| `STANDARD_TIER_CUTOFF` | `20_000_000` | 20.00 USDC | Boundary where 5% exceeds 0.50 USDC |
| `ENTERPRISE_TIER_CUTOFF` | `10_000_000_000` | 10,000.00 USDC | Boundary transitioning to 2% marginal rate |
| `ENTERPRISE_TIER_BASE` | `500_000_000` | 500.00 USDC | Accumulated bond at $10k threshold |
| `MAX_DISPUTE_BOND` | `2_500_000_000` | 2,500.00 USDC | Hard ceiling for all high-notional pacts |

---

## 3. Benchmark & Economic Comparison Table

| Pact Notional ($) | V1 Bond ($) | V1 Bond (% of Pact) | V2 Bond ($) | V2 Bond (% of Pact) | Economic Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **$0.40** | $1.00 | 250.0% | **$0.40** | 100.0% | Bond capped by pact size, accessible |
| **$1.00** | $1.00 | 100.0% | **$0.50** | 50.0% | 50% reduction in barrier, still penalizing |
| **$5.00** | $1.00 | 20.0% | **$0.50** | 10.0% | 50% friction reduction |
| **$10.00** | $1.00 | 10.0% | **$0.50** | 5.0% | Exactly aligned with 5% standard rate |
| **$50.00** | $2.50 | 5.0% | **$2.50** | 5.0% | Standard 5% rate |
| **$100.00** | $5.00 | 5.0% | **$5.00** | 5.0% | Standard 5% rate |
| **$1,000.00** | $50.00 | 5.0% | **$50.00** | 5.0% | Standard 5% rate |
| **$10,000.00** | $500.00 | 5.0% | **$500.00** | 5.0% | Threshold boundary ($500 base) |
| **$50,000.00** | $2,500.00 | 5.0% | **$1,300.00** | 2.6% | $500 + 2% of $40k (48% capital savings) |
| **$100,000.00** | $5,000.00 | 5.0% | **$2,300.00** | 2.3% | $500 + 2% of $90k (54% capital savings) |
| **$500,000.00** | $25,000.00 | 5.0% | **$2,500.00** | 0.5% | Capped at $2,500 max (90% capital savings) |
| **$1,000,000.00**| $50,000.00 | 5.0% | **$2,500.00** | 0.25% | Capped at $2,500 max (95% capital savings) |

---

## 4. Attack Scenarios & Game-Theoretic Safeguards

### Scenario A: Zero-Cost Spam & Griefing
- **Attack Vector**: Attacker creates hundreds of micro-pacts ($1 USDC) and maliciously opens disputes to lock the counterparty's capital for 17 days (3d response + 14d arbiter).
- **V2 Defense**: The minimum bond floor is $0.50 USDC (or 100% of notional if $<0.50$). Attacker must post $0.50 on every single dispute. When respondent counters and arbiter rules in respondent's favor, the attacker forfeits 100% of their bonds. Attacking 100 pacts costs $50 in immediate lost capital.

### Scenario B: Asymmetric Capital Hold-Up on High-Value Pacts
- **Attack Vector**: In a $1,000,000 commercial pact, a well-funded enterprise opens a bad-faith dispute expecting the individual contractor cannot afford a $50,000 bond to respond within 3 days.
- **V2 Defense**: V2 caps the bond at $2,500 USDC. A $2,500 counter-bond is accessible for a high-value contractor, while the enterprise still risks losing $2,500 in cash if the arbiter rules against them.

### Scenario C: Arbiter Fee Extraction & Escrow Drain
- **Attack Vector**: Rogue or misconfigured arbiter claims a massive fee that drains the pact's escrowed collateral.
- **V2 Defense**:
  1. `arbiterFeeCap <= bondAmount` is enforced at pact creation.
  2. `ruleDispute()` allows arbiter fee deduction *only* from the losing party's bond pool.
  3. The winner receives 100% of the collateral principal plus their own bond back plus `(loserBond - feeClaimed)`.
  4. Escrow collateral is **cryptographically ring-fenced** and never touched for arbitration fees.

### Scenario D: Unanswered Dispute (Default Judgment)
- **Mechanic**: If the respondent fails to post their counter-bond within 3 days (`RESPONSE_WINDOW`), the opener wins by default.
- **Payoff**: Opener receives their opening bond back 100%, and receives 100% of all escrowed collateral. No arbiter fee is paid.

### Scenario E: Arbiter Timeout (14 Days)
- **Mechanic**: If both parties post bonds but the arbiter fails to rule within 14 days (`ARBITER_TIMEOUT`), the dispute aborts.
- **Payoff**: Both Maker and Taker bonds are refunded 100%. No arbiter fee is paid. All collateral tokens are split 50/50 atomically.

---

## 5. Token Decimals & Arithmetic Invariants

1. **Explicit Currency**: Dispute bonds are always denominated and collected in **USDC**.
2. **Decimal Handling**:
   - `notionalUSDC` is strictly stored and calculated in **6 decimals** (`uint128`).
   - If non-USDC collateral tokens (e.g. 18-decimal DAI or 8-decimal WBTC) are used in future versions, `notionalUSDC` represents the normalized 6-decimal valuation committed at creation.
3. **Rounding Direction**:
   - All bond calculations use ceil-division:
     ```solidity
     function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
         return (a + b - 1) / b;
     }
     ```
   - Rounding up guarantees that any fractional micro-cent is never truncated to zero, maintaining mathematical correctness across all inputs.

---

## 6. Implementation Checklist & Migration

- [x] Document ADR-0002 with mathematical formula and benchmarks.
- [ ] Implement `computeDisputeBond(uint128 notionalUSDC)` in `contracts/src/PactV2.sol`.
- [ ] Ensure `arbiterFeeCap <= computedBond` validation.
- [ ] Update `contracts/test/PactV2.t.sol` and `contracts/test/PactV2Invariant.t.sol`.
- [ ] Write Foundry fuzz tests across full `uint96` notional spectrum.
- [ ] Verify `forge test` passes 100%.
