# ADR-0004: PACT Notification System, Event Ingestion & Privacy Model

Status: Proposed

---

## 1. Problem Statement & Context

Escrow agreements on PACT involve strict, binding blockchain cutoffs:
- **Offer Expiry**: Maker's offer expires if not accepted in time.
- **Performance Deadline**: Taker must submit proof before this cutoff.
- **Dispute Window**: 3-day challenge window before funds can be claimed.
- **Response Deadline**: Respondent has exactly 72 hours to post a counter-bond.
- **Arbiter Ruling Window**: Arbiter has 14 days before timeout.
- **Withdrawable Credits**: Users need timely notification when funds move from escrow to pull-credits.

Missed deadlines lead to irreversible financial outcomes (default losses or expired offers). However, commercial contracts often contain sensitive trade data. Sending plaintext terms or tracking user wallets via third-party advertising or analytics SDKs violates user privacy.

---

## 2. Core Architecture & Privacy Invariants

### Invariant 1: Zero Third-Party Data Leakage
- **No Private Terms in Payloads**: Notification titles and bodies contain only public on-chain identifiers (`Pact #0042`, `Kind: Delivery`, `Amount: 500 USDC`, `Cutoff: 12h remaining`).
- **No Third-Party Analytics Tracking**: Notification events are NEVER forwarded to Google Analytics, Mixpanel, Segment, or ad networks.
- **Local-First & Client-Side Ingestion**: Event parsing, deadline evaluations, and preference filtering execute entirely client-side or through self-hosted/first-party indexers.

### Invariant 2: Pure Opt-In for External Channels
- **In-App First**: The default channel is the in-app notification center & top warning banner.
- **External Channels (Web Push / Email / Webhook)**: Strictly disabled by default. Enabled ONLY when the user explicitly grants browser permissions and saves preferences.

### Invariant 3: Idempotency & Arc Duplicate Log Deduplication
- Blockchain RPCs and Arc reorgs can emit identical event logs multiple times.
- Every notification is assigned a deterministic, idempotent ID:
  $$\text{ID} = \text{keccak256}(\text{pactId} \parallel \text{eventType} \parallel \text{eventEpochOrTxHash})$$
- Notifications are deduplicated before reaching the UI or storage.

---

## 3. Event Matrix & Deep-Link Mapping

| Event Type | Priority | Trigger Condition | Target Role | Deep-Link Action |
| :--- | :--- | :--- | :--- | :--- |
| `DEADLINE_OFFER_EXPIRING` | ⚠️ Medium | Offer expiry within 2 hours | Maker / Taker | `/p/[id]` (Accept or Expire) |
| `DEADLINE_PERFORMANCE_URGENT`| 🚨 Urgent | Performance deadline within 24 hours | Taker | `/p/[id]` (Submit Proof) |
| `DEADLINE_DISPUTE_CLOSING` | ⚠️ Medium | Dispute cutoff within 24 hours | Maker / Taker | `/p/[id]` (Review or Dispute) |
| `PROOF_SUBMITTED` | ℹ️ Info | Taker submitted fulfillment proof | Maker | `/p/[id]` (Release Funds) |
| `DISPUTE_OPENED` | 🚨 Critical | Counterparty initiated dispute | Respondent | `/p/[id]` (Post Counter-Bond in 72h) |
| `DISPUTE_RESPONDED` | ℹ️ Info | Respondent posted counter-bond | Arbiter / Opener | `/p/[id]` (Pending Arbiter Ruling) |
| `DISPUTE_RULED` | ℹ️ Info | Arbiter delivered binding judgment | Maker / Taker | `/p/[id]` (View Resolution) |
| `WITHDRAW_AVAILABLE` | 💰 Value | New pull-payment credit available | Recipient | `/me` (Withdraw to Wallet) |

---

## 4. Notification Preferences Schema

Stored locally in `localStorage` keyed by `pact:notifications:prefs:${walletAddress}`:
```typescript
interface NotificationPreferences {
  enabledCategories: {
    deadlines: boolean     // Urgent deadline reminders
    proofs: boolean        // Work delivery proofs
    disputes: boolean      // Dispute challenges & responses
    withdrawals: boolean   // Claimable pull credits
  }
  urgencyThresholdHours: number // Default: 24h
  soundEnabled: boolean         // Audible chime on new alert
  inAppBanner: boolean          // Sticky banner on overview
  browserPushOptIn: boolean     // Explicit browser push opt-in
}
```

---

## 5. Implementation Roadmap

1. **`lib/notifications.ts`**: Types, deterministic ID generator, deduplication, deadline evaluation engine, storage helpers.
2. **`hooks/useNotifications.ts`**: Polling indexer + active clock interval to derive real-time notifications for connected wallet.
3. **`components/NotificationCenter.tsx`**: Header Bell icon, unread counter badge, filter tabs, deep links, settings & unsubscribe.
4. **`tests/notifications.test.ts`**: Comprehensive test suite verifying deadline triggers, duplicate log suppression, privacy protection, and preference filtering.
