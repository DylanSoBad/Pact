'use client'

import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { USDC_ERC20, EURC } from '../lib/arc'
import { ERC20_ABI } from '../lib/abi'
import { formatUnits } from 'viem'

export default function ConnectButton() {
  const { address, isConnected } = useAccount()

  const { data: usdcBal } = useReadContract({
    address: USDC_ERC20 as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  })

  const { data: eurcBal } = useReadContract({
    address: EURC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  })

  const formattedUsdc = usdcBal !== undefined ? formatUnits(usdcBal as bigint, 6) : '0'
  const formattedEurc = eurcBal !== undefined ? formatUnits(eurcBal as bigint, 6) : '0'

  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) => (
        <button
          onClick={show}
          className={`btn-ghost px-3.5 py-[7px] text-[13px] font-medium transition-all flex items-center gap-2 ${
            isConnected
              ? 'text-zinc-200 border-zinc-700/60 bg-white/[0.04]'
              : 'text-zinc-400 border-zinc-800 hover:text-zinc-100'
          }`}
        >
          {isConnected ? (
            <>
              <span className="text-emerald-400 font-mono text-[12px]">
                {Number(formattedUsdc).toFixed(1)} USDC
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300">{ensName ?? truncatedAddress}</span>
            </>
          ) : (
            "Connect"
          )}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}
