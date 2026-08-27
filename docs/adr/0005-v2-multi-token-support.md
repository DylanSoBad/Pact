# ADR 0005: Multi-Token Support & Safe-Managed Allowlist

## Status
Proposed

## Context
Pact V1 and early V2 iterations hardcoded support for a limited set of tokens (USDC, EURC, USYC). As the protocol scales, participants wish to use various ERC-20 tokens (e.g., WETH, WBTC, ARC) as collateral. However, expanding token support introduces significant security and accounting risks:
- Fee-on-transfer tokens break standard escrow accounting.
- Rebasing tokens change balances dynamically.
- Malicious/custom tokens could grief the dispute bond mechanism or introduce reentrancy.
- UI dropdowns that accept arbitrary addresses can lead to phishing (e.g., fake "USDC").

We need a structured way to allow new tokens without compromising the core exact-transfer accounting, dispute bond economics, or participant safety.

## Decisions

### 1. Safe-Managed On-Chain Allowlist
Tokens must be explicitly allowlisted by the protocol's Admin Safe. 
- The contract maintains a `mapping(address => bool) public allowedToken;`.
- A new `setTokenAllowed(address token, bool allowed) external onlyAdmin` function will be introduced.
- Pact creation will strictly enforce `require(allowedToken[token])`. No arbitrary user-supplied token addresses are permitted.

### 2. Exact-Transfer Accounting (Strict Rejection of FOT)
Pact V2 will retain its exact-transfer accounting mechanism in `_pullExact`:
```solidity
uint256 beforeBalance = IERC20(token).balanceOf(address(this));
IERC20(token).safeTransferFrom(from, address(this), amount);
uint256 received = IERC20(token).balanceOf(address(this)) - beforeBalance;
if (received != amount) revert TransferAmountMismatch();
```
- **Fee-on-Transfer (FOT) tokens will systematically revert upon deposit**. This is an intentional security feature. Escrow requires 1:1 payouts; we will not support FOT tokens.
- Rebasing tokens will not be allowlisted. If they are accidentally allowlisted, rebases will not be credited to users.

### 3. Decimals Independence & USDC Bond Peg
- Collateral tokens can have arbitrary decimals (e.g., 18 for WETH, 6 for USDC).
- **Dispute bonds and arbiter caps remain strictly denominated in 6-decimal USDC.**
- During Pact creation, participants must negotiate and lock in the `notionalUSDC` value of the pact. This completely decouples token volatility from the dispute bond calculation and prevents griefing attacks where a collapsed token's bond becomes effectively zero.

### 4. UI Risk Disclosures
- The frontend will map on-chain allowlisted tokens to a verified metadata registry (symbol, decimals, logo).
- Non-stablecoin tokens will display a clear "Volatility Risk" badge.
- The UI will explicitly highlight the decimals and exact amounts to prevent UI spoofing attacks.

### 5. Invariant Testing per Token
The accounting invariant `accountedBalance(token) == totalEscrow[token] + totalCredits[token]` must hold independently for every allowlisted token.

## Consequences
- **Positive**: Safely unlocks WETH/WBTC and other major assets for escrow.
- **Positive**: Dispute bonds remain robust against collateral token price crashes.
- **Negative**: Adds governance overhead for the Admin Safe to evaluate and allowlist new tokens.
- **Negative**: UX friction requiring participants to agree on a `notionalUSDC` value for non-USDC pacts.
