'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { ConnectKitProvider } from 'connectkit'
import { config } from '../wagmi'
import WrongNetworkGate from './WrongNetworkGate'
import React from 'react'

const queryClient = new QueryClient()

export default function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider mode="dark">
          <WrongNetworkGate>
            {children}
          </WrongNetworkGate>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
