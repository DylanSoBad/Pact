# ADR-0003: PACT V2 Arbiter Fee Economics & Anti-Collateral-Griefing Mechanism

Status: Proposed for PACT V2. PACT V1 remains active and unaffected.

---

## 1. Problem Statement & Incentive Traps

In decentralized escrow arbitration, naive fee models create two dangerous economic hazards:
1. **Collateral Dilution Hazard**: If the arbitration fee is deducted from the escrowed collateral principal, the winning party is penalized and undercompensated despite delivering faithfully on their contract.
2. **Arbiter Collusion / Excess Extraction Hazard**: If arbiters can charge arbitrary fees or set uncapped claims, a rogue arbiter can collude with one party to siphon off the entire value of the contract.
3. **Inaction Free-Riding**: If arbiters receive guaranteed retainers regardless of whether they rule or time out, arbiters have no incentive to resolve disputes swiftly.

---

## 2. PACT V2 Arbiter Fee Economic Rules & Invariants

### Invariant 1: Principal Collateral Ring-Fencing
Escrowed deal collateral ($C_{\text{maker}}$ and $C_{\text{taker}}$) is **100% cryptographically ring-fenced**.
Under NO circumstances is any fraction of the collateral principal diverted to pay arbitration fees.

### Invariant 2: Pure "Loser-Pays" Bond Internalization
All arbitration fees are funded strictly out of the **losing party's dispute bond**:
- Opener posts: $\text{Bond}$
- Respondent posts: $\text{Bond}$
- Total Bond Pool: $2 \times \text{Bond}$
- Winner receives:
  $$\text{Payout}_{\text{winner}} = C_{\text{maker}} + C_{\text{taker}} + \text{Bond}_{\text{winner}} + (\text{Bond}_{\text{loser}} - \text{Fee}_{\text{claimed}})$$
- Arbiter receives:
  $$\text{Payout}_{\text{arbiter}} = \text{Fee}_{\text{claimed}} \quad \text{where } \text{Fee}_{\text{claimed}} \le \text{ArbiterFeeCap} \le \text{Bond}$$
- Loser receives: $\$0$.

### Invariant 3: Zero-Fee Conditions ($\text{Fee} = 0$)
The Arbiter receives strictly $\$0$ in all of the following deterministic states:
1. **No Dispute / Normal Settlement**: If the pact completes via `release()`, `refundAfterDeadline()`, `cancelPact()`, or `expireOffer()`.
2. **Uncontested Dispute / Default Judgment (`resolveUnansweredDispute`)**: If the respondent fails to post their counter-bond within 3 days (`RESPONSE_WINDOW`), the opener wins automatically without needing arbiter intervention. Arbiter receives $\$0$.
3. **Arbiter Inaction / Timeout (`arbiterTimeout`)**: If the arbiter fails to deliver a ruling within 14 days (`ARBITER_TIMEOUT`), the arbiter is penalized with **$0 fee**, both parties receive a 100% refund of their bonds, and collateral is split 50/50.
4. **Pro-Bono / Zero Fee Cap Agreements**: When `arbiterFeeCap == 0` at creation.

---

## 3. Mathematical Bounds & Validation Matrix

Let $N = \text{notionalUSDC}$ and $B = \text{computeDisputeBond}(N)$.

1. **Fee Cap Upper Bound**:
   $$0 \le \text{ArbiterFeeCap} \le B$$
   Enforced at `createPact()`: `if (arbiterFeeCap > computedBond) revert FeeExceedsCap();`
2. **Ruling Claim Upper Bound**:
   $$0 \le \text{FeeClaimed} \le \text{ArbiterFeeCap}$$
   Enforced at `ruleDispute()`: `if (feeClaimed > pact.arbiterFeeCap || feeClaimed > pact.bondAmount) revert FeeExceedsCap();`
3. **Winner Compensation Guarantee**:
   The winner always receives at least their principal + their own bond, plus a non-negative punitive bonus:
   $$\Delta_{\text{winner}} = B - \text{FeeClaimed} \ge 0$$

---

## 4. Multi-Scale Simulation Matrix

| Pact Type | Notional ($) | Dispute Bond ($) | Fee Cap ($) | Dispute Ruling Outcome | Winner Receives | Arbiter Receives | Loser Receives |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Micro Gig** | $5.00 | $0.50 | $0.50 | Maker wins (Fee = $0.50) | $5.00 collateral + $0.50 bond = **$5.50** | **$0.50** | **$0.00** |
| **Micro Gig** | $5.00 | $0.50 | $0.25 | Maker wins (Fee = $0.25) | $5.00 collateral + $0.75 bond = **$5.75** | **$0.25** | **$0.00** |
| **Micro Gig** | $5.00 | $0.50 | $0.50 | Taker defaults (3 days) | $5.00 collateral + $0.50 bond = **$5.50** | **$0.00** | **$0.00** |
| **Micro Gig** | $5.00 | $0.50 | $0.50 | Arbiter timeout (14 days)| $2.50 collateral + $0.50 bond = **$3.00** | **$0.00** | **$3.00** |
| **Standard Deal** | $1,000.00 | $50.00 | $30.00 | Taker wins (Fee = $30.00)| $1,000 collateral + $70 bond = **$1,070** | **$30.00** | **$0.00** |
| **Enterprise Deal**| $100,000.00 | $2,300.00 | $1,500.00 | Maker wins (Fee = $1,500)| $100k collateral + $3.1k bond = **$103.1k**| **$1,500.00**| **$0.00** |

---

## 5. UI Transparency & Pre-Lock Disclosure Specification

Before locking any funds:
1. **Creation Step 2 & 4**: UI displays maximum arbiter fee cap alongside bond requirement and validates $\text{feeCap} \le \text{bond}$.
2. **Pact Detail & Terms Verifier**: Displays explicit breakdown:
   - "Dispute Bond: $X USDC (posted only upon dispute)"
   - "Arbiter Max Fee: $Y USDC (funded exclusively from loser's bond)"
   - "Collateral Protection: 100% ring-fenced for winner"
3. **Dispute Resolution Flow**: Arbiter ruling interface enforces input mask $0 \le \text{feeClaimed} \le \text{arbiterFeeCap}$.
