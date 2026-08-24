# Mandatory Arc Testnet live canary

This canary is a release gate, not an informal smoke test. Record transaction hashes and measured balances for every item. Never reuse mainnet keys or assets.

1. Submit a transaction with `maxFeePerGas` below 20 Gwei, then resubmit safely above the network minimum. The expected failure signature is a transaction that remains pending rather than reverting; monitoring must classify it as fee-underpriced, not an RPC outage.
2. Settle into pull-payment credits for a known blocklisted test address. Its `withdraw()` must revert at runtime and burn gas, while a second recipient must still withdraw successfully and all credits must remain accounted.
3. Give a test account a native balance containing sub-`1e12` dust, confirm `balanceOf == nativeBalance / 1e12`, then move the complete visible 6-decimal balance through the ERC-20 path. The dust must floor to zero in `balanceOf`, remain outside PACT's ledger, and no withdrawal may leave accounted residue in the contract.
4. Capture every log from one Arc USDC transfer. Confirm both the 6-decimal ERC-20 `Transfer` and 18-decimal system-emitter `Transfer` exist. The indexer must identify the mirror pair and count one economic transfer, not sum both logs.
5. Submit multiple transactions that land in one Arc block. Confirm ordering uses transaction/log index or block number and no state transition assumes timestamps increase strictly between transactions.
6. Execute `create → accept → dispute → respond → settle → withdraw` with live Arc USDC, using atomic EIP-2612 permit for at least create and one dispute bond. Confirm each signed nonce increments exactly once and an intentionally reverted action does not consume its permit. At every transaction boundary, verify actual token balance equals `totalEscrow + totalCredits`; after all withdrawals both accounting totals and contract balance attributable to the pact must return to zero.

Release is blocked if any item is missing evidence or produces a different failure signature.
