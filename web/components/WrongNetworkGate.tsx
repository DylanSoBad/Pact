'use client'

import { useAccount, useSwitchChain } from 'wagmi'
import { arcTestnet } from '../lib/arc'

export default function WrongNetworkGate({ children }: { children: React.ReactNode }) {
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()

  if (chain && chain.id !== arcTestnet.id) {
    return (
      <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
        <h2 className="text-[#ff4d4d] font-mono text-xl mb-4">WRONG NETWORK</h2>
        <p className="text-gray-400 font-mono mb-6">Switch to Arc Testnet to use Pact.</p>
        <button 
          onClick={() => switchChain({ chainId: arcTestnet.id })}
          className="border border-[#c8f542] text-[#c8f542] px-6 py-2 font-mono hover:bg-[#c8f542] hover:text-black transition-colors"
        >
          SWITCH TO ARC TESTNET
        </button>
      </div>
    )
  }

  return <>{children}</>
}
