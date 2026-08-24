import { fallback, http } from 'viem'
import { createConfig } from 'wagmi'
import { arcTestnet } from './lib/arc'
import { getDefaultConfig } from 'connectkit'

const walletConnectProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID

if (!walletConnectProjectId) {
  throw new Error('NEXT_PUBLIC_WC_PROJECT_ID is required')
}

const rpcUrls = [
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  process.env.NEXT_PUBLIC_ARC_RPC_FALLBACK_URL,
  arcTestnet.rpcUrls.default.http[0],
].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index)

export const config = createConfig(
  getDefaultConfig({
    appName: 'Pact Protocol',
    appDescription: 'A promise with money locked behind it. economic contracts with collateral. not a dex.',
    appUrl: 'https://pact-arc.vercel.app',
    walletConnectProjectId,
    chains: [arcTestnet],
    enableAaveAccount: false,
    transports: {
      [arcTestnet.id]: fallback(rpcUrls.map(url => http(url, { timeout: 8_000 })), { rank: true }),
    },
  })
)
