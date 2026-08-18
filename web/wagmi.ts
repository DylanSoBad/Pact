import { http, createConfig } from 'wagmi'
import { arcTestnet } from './lib/arc'
import { getDefaultConfig } from 'connectkit'

export const config = createConfig(
  getDefaultConfig({
    appName: 'Pact Protocol',
    appDescription: 'Trustless collateral escrow and atomic settlement on Circle Arc',
    appUrl: 'https://pact-arc.vercel.app',
    walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'c4f79cc821944d9680842e34466bfb',
    chains: [arcTestnet],
    enableAaveAccount: false,
    transports: {
      [arcTestnet.id]: http(),
    },
  })
)
