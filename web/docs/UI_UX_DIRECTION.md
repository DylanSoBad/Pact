# PACT Protocol — Design Direction & System Specification

**Role:** Lead Product Designer & Senior Frontend Engineer  
**System:** Institutional Terminal & Escrow Protocol Design System  
**Version:** 2.0 (Arc Network Testnet)

---

## 1. Brand Identity & Visual Language

PACT is an institutional-grade decentralized escrow and settlement protocol on Arc Network. The aesthetic is inspired by Bloomberg terminals, Swiss typography, and high-security cryptographic infrastructure.

### Core Visual Tenets:
1. **Precision & Density:** High information density without clutter. Crisp 1px border lines, structured grids, and monospaced cryptographic hashes.
2. **Institutional Palette:** Deep graphite surfaces (`#07080a`, `#0c0f12`, `#12161b`), high-contrast off-whites (`#f4f4f6`, `#e2e4e9`), and a surgical lime accent (`#c8f542` / `#d8ff63`).
3. **Restraint over Gimmicks:** No noisy casino neon gradients, no distracting floating orbs or exaggerated bouncy physics. Spacing, typography, and clear state communication take priority.
4. **Transparent Capital Custody:** The UI always makes clear who holds the funds, what stage the agreement is in, and what action is required.

---

## 2. Design Tokens & Color Palette

### Base Surfaces & Monochromes:
- **Canvas / App Background:** `#07080a` (Absolute dark base)
- **Surface Level 1 (Panels & Cards):** `#0c0f12` (Raised panel)
- **Surface Level 2 (Inner Containers & Inputs):** `#12161b` (Secondary background)
- **Surface Level 3 (Hover / Active):** `#181e25`
- **Borders & Hairlines:**
  - `border-outline-hairline`: `#1e242c` (Subtle boundary)
  - `border-outline-border`: `#2e3742` (Standard component border)
  - `border-outline-focus`: `#c8f542` (Active / focused input)

### Accent & Brand Colors:
- **Primary Fixed (Lime):** `#c8f542` (Institutional accent / CTA)
- **Primary Hover:** `#d8ff63`
- **Primary Text on Lime:** `#090b0d` (High contrast dark text on lime)
- **Primary Container / Tint:** `rgba(200, 245, 66, 0.08)` (Subtle selection background)

### Semantic Status Colors:
- **Offered / Pending:** `#38bdf8` (Sky blue — awaiting counterparty signature)
- **Active / Funded:** `#c8f542` (Lime green — collateral locked, performance in progress)
- **Proof Submitted:** `#a78bfa` (Purple / Lavender — verification pending)
- **Disputed:** `#fbbf24` (Amber yellow — bonded arbitration active)
- **Settled / Cleared:** `#4ade80` (Emerald — successfully cleared to destination)
- **Cancelled / Expired:** `#94a3b8` (Muted slate — refund credited)
- **Error / Critical Alert:** `#f43f5e` (Rose red — action blocked or validation failed)

---

## 3. Typography Hierarchy

Fonts:
- **Body & Structural Sans:** `IBM Plex Sans` (Legibility for paragraphs, instructions, legal terms)
- **Data, Numbers & Cryptographic Hashes:** `IBM Plex Mono` / `SF Mono` (Monospace for amounts, addresses, timestamps, status codes)

Scale:
- **Display 1 (Page Hero / Big Numbers):** `28px - 32px` | Semibold / Bold | Mono
- **Headline 2 (Section Headers):** `18px - 20px` | Medium / Semibold | Mono
- **Headline 3 (Card Titles / Steps):** `14px - 15px` | Semibold | Mono
- **Body Standard:** `13px` | Regular (Line height: 20px) | Sans / Mono
- **Body Compact / Data:** `12px` | Regular (Line height: 18px) | Mono
- **Eyebrow / Label Caps:** `10px - 11px` | Semibold | 0.12em letter spacing | UPPERCASE Mono
- **Hash & Address Code:** `11px - 12px` | Regular | Mono

---

## 4. Component Patterns

### A. Stepped "New Pact" Form
- **Step 1: Parties & Structure** — Deal Type (Delivery vs Job), Designated Counterparty address, Designated Arbiter address (with inline validation & reputation preview).
- **Step 2: Collateral & Economics** — Maker Token & Amount, Counterparty Token & Amount, Notional USD benchmark, Arbiter Fee Cap, Auto-calculated 5% Dispute Bond.
- **Step 3: Deadlines & Written Terms** — Offer Expiry (hrs), Performance Window (days), Dispute Window (days), Plaintext Agreement Terms (Markdown/Text with live character counter & canonical hash generator).
- **Step 4: Pre-Flight Review & Authorization** — Summary matrix of all commitments, exact allowance authorization check, irreversible transaction disclaimer, and atomic creation CTA.

### B. "The Tape" & Market Overview (`/`)
- Real-time heartbeat indicator with block freshness timer (`Last block: 3s ago`).
- Category filters (`ALL`, `DELIVERY`, `JOB`, `STREAMING`).
- High-contrast tabular row with clear status chips, token pairs, and counterparty previews.
- Responsive mobile card translation without horizontal scroll clipping.

### C. Portfolio & Action Center (`/me`)
- Prominent Connected Account Card with quick copy, ArcScan link, and on-chain track record scorecards (Cleared, Slashed, Notional, Reliability %).
- **Action Center:** Priority queue highlighting urgent actions (Expiring within 24h, unaccepted offers, proof reviews, active disputes).
- Filterable historical commitments (All / As Maker / As Counterparty).

### D. Pact Detail & Execution Hub (`/p/[id]`)
- **Lifecycle Timeline:** Visual progression with current stage, deadlines, and completed milestones.
- **Custody Card:** Transparent on-chain vault details showing exact locked balances in contract.
- **Role-Aware Contextual Action Bar:** Connected wallet dynamically receives the primary action (e.g. Maker sees "Release Collateral" / "Open Dispute", Taker sees "Accept Offer" / "Submit Proof").
- **Interactive Terms Hash Verifier:** Easy copy-paste box to cryptographically verify plain text terms against on-chain commitment.

### E. Transaction Progress & Error Recovery
- **Stage 1: Awaiting Wallet Signature** (Explaining exact Permit / ERC-20 approval).
- **Stage 2: Confirming on Arc Testnet** (Spinner, Block number, clickable ArcScan Tx link).
- **Stage 3: Confirmed / Failed** (Clear success confirmation or translated, human-friendly error with safe retry button).

---

## 5. Desktop vs Mobile Responsive Behavior

| Feature | Desktop (>= 768px) | Mobile (< 768px) |
|---|---|---|
| **Navigation** | Sticky Top Navbar with Logo, Links, Faucet CTA, Wallet button | Slim Top Header + Sticky Bottom Tab Bar (Overview, New Pact, Portfolio) |
| **Tap Targets** | Standard buttons (min 40px height) | Strict 44px min tap target for all clickable items |
| **Data Tables** | 5-column unified monospace grid | Structured 2-row card with clear status & counterparty metadata |
| **New Pact Form** | Multi-column grid layout with live side-by-side preview | Vertical stepped accordion / scroll with sticky bottom action |
| **Pact Detail** | 3-column financial & party grid + main execution pane | Stacked cards with priority given to Contextual CTA & Deadlines |

---

## 6. Microcopy & Risk Transparency

1. **Testnet Notice:** *"Arc Testnet Environment — All contracts and assets are for test/demonstration purposes. Obtain test USDC from the Circle Faucet."*
2. **Escrow Custody:** *"Collateral is locked directly in the verified PACT protocol smart contract. Funds cannot be withdrawn until deadline expiration or mutual settlement."*
3. **Terms Hash Security:** *"The terms hash is an immutable SHA-256 cryptographic digest of your plaintext agreement. Always retain a copy of the exact plaintext terms."*
4. **Dispute Protection:** *"A 5% dispute bond protects both parties against frivolous claims. The winning party is fully refunded their bond; arbiter fees are deducted only from the losing party's bond."*
