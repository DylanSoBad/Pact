import { defineChain } from 'viem'

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

export const USDC_ERC20 = "0x3600000000000000000000000000000000000000"; // 6 decimals
export const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";       // 6 decimals

export const OFFICIAL_PACT_ADDRESS: `0x${string}` = "0x0000000000000000000000000000000000000000";

export function getPactAddress(): `0x${string}` {
  const configuredAddress = process.env.NEXT_PUBLIC_PACT_ADDRESS
  if (configuredAddress && configuredAddress !== '0x0000000000000000000000000000000000000000') {
    return configuredAddress as `0x${string}`
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('pact_contract_address')
    if (saved && saved.startsWith('0x') && saved.length === 42 && saved !== '0x0000000000000000000000000000000000000000') {
      return saved as `0x${string}`
    }
  }
  return OFFICIAL_PACT_ADDRESS
}
