'use client'

import { useAccount, useSwitchChain } from 'wagmi'
import { arcTestnet } from '../lib/arc'

export default function WrongNetworkGate({ children }: { children: React.ReactNode }) {
  const { isConnected, chain } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (isConnected && chain && chain.id !== arcTestnet.id) {
    return (
      <div className="fixed inset-0 bg-[#090a0c]/95 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
        <div className="bg-[#111215] border border-rose-500/40 rounded-lg p-6 max-w-md w-full shadow-2xl text-center">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto mb-3 font-mono font-bold text-sm">
            !
          </div>
          <h2 className="text-base font-semibold text-zinc-100 mb-1.5">Unsupported Network Detected</h2>
          <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
            Pact Protocol smart contracts are deployed on <strong className="text-zinc-200">Circle Arc Testnet (Chain ID 5042002)</strong>. Please switch your wallet network to continue.
          </p>
          <button 
            onClick={() => switchChain({ chainId: arcTestnet.id })}
            disabled={isPending}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-2.5 rounded-md font-mono text-xs font-bold tracking-wider transition-all cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {isPending ? 'Requesting Switch in Wallet...' : 'Switch to Circle Arc Testnet'}
          </button>
          <div className="mt-4 pt-3 border-t border-[#1e1f25] text-[11px] font-mono text-zinc-500">
            Explorer: <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">testnet.arcscan.app</a>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
