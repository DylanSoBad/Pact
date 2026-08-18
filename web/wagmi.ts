import { http, createConfig } from 'wagmi'
import { arcTestnet } from './lib/arc'
import { getDefaultConfig } from 'connectkit'

export const config = createConfig(
  getDefaultConfig({
    appName: 'Pact',
    walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo_project_id',
    chains: [arcTestnet],
    enableAaveAccount: false,
    transports: {
      [arcTestnet.id]: http(),
    },
  })
)
