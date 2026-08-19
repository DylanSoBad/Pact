import { http, createConfig } from 'wagmi'
import { arcTestnet } from './lib/arc'
import { getDefaultConfig } from 'connectkit'

export const config = createConfig(
  getDefaultConfig({
    appName: 'Pact Protocol',
    appDescription: 'A promise with money locked behind it. economic contracts with collateral. not a dex.',
    appUrl: 'https://pact-arc.vercel.app',
    walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'c4f79cc821944d9680842e34466bfb',
    chains: [arcTestnet],
    enableAaveAccount: false,
    transports: {
      [arcTestnet.id]: http(),
    },
  })
)
