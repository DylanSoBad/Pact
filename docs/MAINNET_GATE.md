# PACT Mainnet Gate & Readiness

## 1. Safe Governance Setup
- **Admin**: All protocol administration (unpausing, upgrading implementations via Registry) is handled by a 2-of-3 Gnosis Safe (`adminSafe`).
- **Pause Guardian**: A separate EOAs or low-threshold Safe (`pauseGuardian`) has the authority to pause intake or halt the protocol temporarily in emergencies.
- **Action**: Ensure the mainnet Safe is deployed and owners are verified *before* deploying `PactRegistry` and `PactV2`.

## 2. Monitoring & Runbooks
### Real-time Monitoring
- Monitor the `DisputeOpened` and `DisputeResolved` events. An unexpected spike in disputes indicates potential systemic abuse or UI issues.
- Monitor `IntakePaused` and `AllPaused` events.
- Set up an alert for when `totalEscrow[token]` deviates from the actual ERC-20 token balance of the contract.

### Runbook: Emergency Pause
1. If a critical vulnerability is detected, the `pauseGuardian` should immediately call `pauseAll()`.
2. This halts all settlements and intake for 7 days.
3. Investigate the issue.
4. If a fix is required, deploy a new implementation and update the `PactRegistry`. Provide a migration path for affected users.
5. `adminSafe` can call `unpauseAll()` to resume operations once safe.

## 3. Audit Readiness Snapshot
- `PactV2` has been refactored to remove self-reported notional values, enforce strict `try/catch` on permits, and dynamically calculate bonds based on the token decimals.
- The repository is frozen for audit. No hot-upgrades to V1. V2 will be deployed as a clean slate.
- Coverage includes `PactArcFork.t.sol` testing against EIP-7708 native/ERC-20 mirrors, blocklists, and sub-micro dust attacks.

## 4. Registry Contract
- `PactRegistry.sol` is deployed and versioned by `chainId`.
- Clients should query `PactRegistry.getImplementation(chainId)` to resolve the active `PactV2` contract address before interacting.
