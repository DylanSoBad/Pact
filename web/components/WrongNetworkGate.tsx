'use client'

import { useAccount, useSwitchChain } from 'wagmi'
import { arcTestnet } from '../lib/arc'

export default function WrongNetworkGate({ children }: { children: React.ReactNode }) {
  const { isConnected, chain } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  return (
    <>
      {isConnected && chain && chain.id !== arcTestnet.id && (
        <div className="sticky top-0 z-50 bg-rose-950/90 border-b border-rose-500/30 px-4 py-2.5 backdrop-blur-md">
          <div className="max-w-[880px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-mono text-rose-300">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shrink-0" />
              <span>You are connected to {chain.name || 'unsupported network'}. Switch to Circle Arc Testnet (5042002).</span>
            </span>
            <button
              onClick={() => switchChain({ chainId: arcTestnet.id })}
              disabled={isPending}
              className="bg-rose-500 hover:bg-rose-400 text-black px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isPending ? 'Switching...' : 'Switch Network'}
            </button>
          </div>
        </div>
      )}
      {children}
    </>
  )
}
