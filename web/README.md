# PACT web

Next.js interface for PACT V1 on Arc Testnet (`5042002`). Copy `.env.example` to `.env.local`, set a WalletConnect project ID, and set the deployed protocol address after the maintainer deployment is verified.

```bash
npm ci
npm test
npm run build
npm run dev
```

Protocol addresses are build-time constants keyed by chain ID. The interface deliberately has no contract deployment route, bytecode, empty-`to` transaction, custom address field, or local-storage address override. A missing or invalid `NEXT_PUBLIC_PACT_ADDRESS_5042002` puts write actions into a blocked state.

Arc USDC actions prefer an atomic EIP-2612 signature, combining permit and protocol action in one transaction. The client verifies the live domain separator and uses a short-lived signature. Other tokens or unsupported wallets fall back to resetting allowance to zero and approving the exact amount.

`NEXT_PUBLIC_ARC_RPC_URL` and its fallback feed both wallet and read clients. `ARC_RPC_URL` is server-only and powers the real block stream. `NEXT_PUBLIC_ERROR_REPORT_URL` is optional; reports are deliberately stripped of wallet addresses, pact terms, calldata, and stack traces.
