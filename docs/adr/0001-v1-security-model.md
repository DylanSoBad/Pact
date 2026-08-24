# ADR-0001: PACT V1 security and settlement model

Status: accepted for Arc Testnet. Mainnet is explicitly out of scope until its infrastructure and token addresses are published.

## Trust boundaries

- V1 depends only on standard ERC-20 calls to allowlisted Arc USDC, EURC, and USYC. Memo, Multicall3From, CallFrom, FxEscrow, native USDC, and all guessed ABIs are excluded.
- The admin is a constructor-injected Safe contract. The deployer receives no transient or permanent authority. Testnet uses a 2-of-3 Safe; the intended mainnet policy is 3-of-5.
- A hot pause guardian may stop intake and trigger one seven-day global pause. Only the Safe can unpause and re-arm global pause. Withdrawal, deadline refunds, dispute response, dispute resolution, and timeout exits remain callable while paused.
- The arbiter is immutable per pact and included in the maker's committed terms before either party can become Active.

## State and funds

```text
create + maker funds -> Offered
  cancel / offer expiry -> Cancelled or Expired -> maker credit
  accept(expectedTermsHash) + taker funds -> Active
    proof -> ProofSubmitted
    mutual/non-disputed resolution -> Settled -> credits
    dispute + response -> Disputed -> arbiter ruling or 14-day timeout -> Settled -> credits
    dispute without response -> default loss after 3 days -> Settled -> credits
```

There is no accepted-but-unfunded state and no `fund()` function. Maker funding is atomic with creation; taker funding and exact terms-hash validation are atomic with acceptance. This removes the free-option window.

All settlement is pull-payment. Contract transitions only move accounting from escrow to `credits[user][token]`; `withdraw()` zeroes credit before the ERC-20 transfer and is non-reentrant. A blocklisted recipient can fail only their own withdrawal.

The contract enforces an allowlist and an exact `balanceAfter - balanceBefore == amount` check. Fee-on-transfer tokens cannot create undercollateralized accounting. Native value is rejected because Arc native and ERC-20 USDC expose the same economic balance at different decimal scales.

Arc USDC EIP-2612 is supported only through atomic action methods: `createPactWithPermit`, `acceptPactWithPermit`, `openDisputeWithPermit`, and `respondDisputeWithPermit`. The UI reads `name`, `version`, `nonces`, and `DOMAIN_SEPARATOR` from the live token, verifies the domain against chain ID and token address, and uses a 20-minute signature deadline. No domain field is hardcoded because token metadata may be upgraded; both Arc RPC endpoints returned version `2` during final validation. The permit and token pull occur in the same transaction, so an action revert also rolls back nonce and allowance. Non-USDC tokens and wallets that cannot sign typed data use the exact approval fallback.

## Dispute economics

At creation, bond is fixed in 6-decimal USDC: `max(ceil(notionalUSDC * 500 / 10_000), 1 USDC)`. The on-chain arbiter fee cap must not exceed the bond. Either party can open a dispute before the deadline and posts one bond. The respondent posts the same bond within three days or loses by default.

- Ruling/default: winner receives all maker and taker collateral. Winner also receives their own bond and the loser's bond minus `feeClaimed`; the arbiter receives that fee. The losing party alone bears the fee and compensation loss.
- Arbiter timeout after 14 days: no arbiter fee, both bonds refunded, and each collateral token split 50/50. Taker receives `amount / 2`; maker receives the remainder, preserving exact totals.
- Arbiter fee never touches collateral and cannot exceed either the stored fee cap or one bond.

## Accounting invariants

For every token, actual contract balance equals `totalEscrow + totalCredits`. Credits and escrow are decremented before external transfers. Total credited value cannot exceed exact deposits. Arbiter payout is bounded by the fee cap and bond. The winner's collateral allocation is never reduced to pay an arbiter.

Arc time is treated as non-decreasing, not strictly increasing. No ordering relies on distinct timestamps, and no randomness uses `PREVRANDAO` or difficulty.

## Arc fork limitation

The fork suite first verifies chain ID and the real Arc token code/decimals. Upstream Foundry REVM currently cannot execute Arc's EIP-7708 native/ERC-20 USDC mirror: even an impersonated funded holder reverts on transfer. After the real-chain assertions, the state-machine cases replace USDC code with an Arc-behavior harness that floors the 18-to-6-decimal projection, reverts for blocklisted recipients, and emits both the ERC-20 and system-emitter transfer logs. This remains a model, not proof of Arc runtime compatibility. The full live canary checklist is a mandatory release gate until the fork engine supports Arc semantics.
