import { defineChain, isAddress } from 'viem'

export const CIRCLE_FAUCET_URL = 'https://faucet.circle.com/'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
})

export const USDC_ERC20: `0x${string}` = "0x3600000000000000000000000000000000000000"; // 6 decimals
export const EURC: `0x${string}` = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";       // 6 decimals
export const USYC: `0x${string}` = "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";       // allowlisted in V1

/** Block containing the verified PACT V1 deployment transaction. */
export const PACT_V1_DEPLOYMENT_BLOCK = 0x3815d83n

const ARC_TESTNET_PACT_ADDRESS = process.env.NEXT_PUBLIC_PACT_ADDRESS_5042002

/**
 * Protocol addresses are build-time configuration keyed by chain ID.
 * User input and browser storage are intentionally never consulted.
 */
export function getPactAddress(chainId: number = arcTestnet.id): `0x${string}` | null {
  if (chainId !== arcTestnet.id) return null
  if (!ARC_TESTNET_PACT_ADDRESS || !isAddress(ARC_TESTNET_PACT_ADDRESS)) return null
  if (ARC_TESTNET_PACT_ADDRESS === '0x0000000000000000000000000000000000000000') return null
  return ARC_TESTNET_PACT_ADDRESS
}
