# Arc Testnet deployment runbook

1. Create and verify a Safe v1.4.1 proxy with three distinct owners and threshold 2 using `CreateTestnetSafe.s.sol`. It defaults the fallback handler to `address(0)` because the canonical 1.4.1 handler has no code on Arc Testnet. Any non-zero handler is rejected unless code is already deployed. Record the full Safe address; truncated addresses are never accepted as configuration.
2. Select a separate pause guardian. It must not be the deployer and must be operationally isolated from Safe owners.
3. Copy `contracts/.env.example`; provide `DEPLOYER_PRIVATE_KEY`, full `ADMIN_SAFE`, `PAUSE_GUARDIAN`, and `ARC_TESTNET_RPC_URL` through a secret manager.
4. Run tests and simulate without `--broadcast`: `forge test`, then `forge script script/DeployPact.s.sol:DeployPact --rpc-url "$ARC_TESTNET_RPC_URL"`.
5. Confirm chain ID `5042002`, constructor token constants, Safe bytecode, and that neither admin nor guardian equals the deployer. Then broadcast using the maintainer script.
6. Verify source and constructor arguments on the Arc explorer. Confirm `adminSafe()`, `pauseGuardian()`, token constants, and that the deployer cannot call Safe/guardian functions.
7. Set `NEXT_PUBLIC_PACT_ADDRESS_5042002` to the verified address and deploy the frontend. Never paste an address into a user-facing field or browser storage.
8. Complete every item in `docs/arc-testnet-canary.md`. This live canary is mandatory because upstream Foundry fork cannot execute Arc's EIP-7708 USDC transfer path. Then execute pause escape paths and the fork/adversarial checklist before announcing availability.

No mainnet deployment is authorized by this runbook.
