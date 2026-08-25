# Arc Testnet deployment

Deployment date: 2026-08-26 (Asia/Saigon)

Chain ID: `5042002`

## Governance Safe

- Safe proxy: `0xE735B89C4f13a7b6237Da769A3995bcC52983C81`
- Threshold: `2-of-3`
- Owner 1: `0x062A7D4DCcfA3B0dD9c99F64cB2d0B439EaCB6B1`
- Owner 2: `0xFb13fD05cAe172A47d56AE74F95c4D5D5f72b73B`
- Owner 3: `0x90851DE4Dd9e4b16547507D0D4ed365f416229c8`
- Fallback handler: `address(0)`
- Creation transaction: `0xb6716c52a02fff54c034fdd8eee819193315e5f512829a9d46f3ccc0f771c03f`

The proxy code, threshold, and all three owners were read back from Arc Testnet after deployment. The deployer is not a Safe owner.

## PACT V1

- Contract: `0x5DC1fb739AFe3A7FA197d75C6A1ED1F72E852813`
- Admin Safe: `0xE735B89C4f13a7b6237Da769A3995bcC52983C81`
- Pause guardian: `0x0292407fADEF8685B039A95C46AA64b85819c3fF`
- USDC: `0x3600000000000000000000000000000000000000`
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- USYC: `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C`
- Deployment transaction: `0xd496f4e575174aaa9450a7b03462439023b4ddd59aac81e86b7701a6c1228424`
- Runtime bytecode: `13,947 bytes`

Constructor configuration and runtime bytecode were read back from Arc Testnet. A simulated admin call from the deployer reverted as expected.

## Frontend

Vercel Production and Preview use the build-time variable:

```text
NEXT_PUBLIC_PACT_ADDRESS_5042002=0x5DC1fb739AFe3A7FA197d75C6A1ED1F72E852813
```

Production: `https://pact-protocol-five.vercel.app`

## Release gates

- Local unit, fuzz, and invariant tests: passed.
- Arc fork/harness suite: 19/19 passed after deployment.
- Vercel production build: ready.
- ArcScan source verification: pending explicit approval to publish the source payload.
- Mandatory live canary transaction evidence: pending; do not treat the deployment as production-audited.
