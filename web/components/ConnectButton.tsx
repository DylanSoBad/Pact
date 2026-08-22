'use client'

import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { USDC_ERC20, EURC, arcTestnet } from '../lib/arc'
import { ERC20_ABI } from '../lib/abi'
import { formatUnits } from 'viem'

export default function ConnectButton() {
  const { address, isConnected, chain, isConnecting } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const isWrongNetwork = isConnected && chain && chain.id !== arcTestnet.id

  const { data: usdcBal } = useReadContract({
    address: USDC_ERC20 as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !isWrongNetwork }
  })

  const { data: eurcBal } = useReadContract({
    address: EURC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !isWrongNetwork }
  })

  const formattedUsdc = usdcBal !== undefined ? formatUnits(usdcBal as bigint, 6) : '0'

  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isSwitching}
        aria-label="Switch network to Arc Testnet"
        className="px-3 py-1.5 bg-rose-950/80 border border-rose-500/50 hover:bg-rose-900 text-rose-300 text-[11px] font-mono uppercase tracking-wider rounded-DEFAULT flex items-center gap-2 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
      >
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
        <span>{isSwitching ? 'SWITCHING...' : 'WRONG NETWORK · SWITCH'}</span>
      </button>
    )
  }

  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting: kitConnecting, show, truncatedAddress, ensName }) => {
        const loading = isConnecting || kitConnecting

        if (loading) {
          return (
            <button
              disabled
              aria-label="Connecting to wallet"
              className="flex min-h-10 items-center gap-2 border border-primary-fixed/40 bg-black px-2.5 text-[11px] font-mono uppercase tracking-wider text-primary-fixed/80 @sm:px-3.5 @sm:text-[12px]"
            >
              <div className="w-2 h-2 rounded-full bg-primary-fixed radar-pulse shrink-0" />
              <span className="hidden @sm:inline">CONNECTING...</span><span className="@sm:hidden">WAIT</span>
            </button>
          )
        }

        return (
          <button
            onClick={show}
            aria-label={isConnected ? `Connected account: ${ensName ?? truncatedAddress}` : 'Connect Web3 Wallet'}
            aria-haspopup="dialog"
            className={`flex min-h-10 min-w-0 items-center gap-2 border px-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors focus-visible:ring-2 focus-visible:ring-primary-fixed focus-visible:outline-none @sm:px-3.5 @sm:text-[12px] ${
              isConnected
                ? 'text-primary-fixed border border-primary-fixed/60 bg-surface-container-lowest hover:border-primary-fixed shadow-[0_0_10px_rgba(198,243,64,0.15)]'
                : 'text-text-muted border border-outline-border hover:border-primary-fixed hover:text-primary-fixed bg-surface-container-lowest'
            }`}
          >
            {isConnected ? (
              <>
                {/* Identicon dot indicator */}
                <span className="w-2 h-2 rounded-full bg-primary-fixed shadow-[0_0_6px_#c8f542] shrink-0" />
                <span className="hidden text-primary-fixed font-mono text-[12px] font-medium @sm:inline">
                  {Number(formattedUsdc).toFixed(1)} USDC
                </span>
                <span className="hidden text-zinc-600 @sm:inline">·</span>
                <span className="max-w-[92px] truncate text-on-surface font-mono font-medium @sm:max-w-none">{ensName ?? truncatedAddress}</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                <span className="hidden @sm:inline">CONNECT WALLET</span><span className="@sm:hidden">WALLET</span>
              </>
            )}
          </button>
        )
      }}
    </ConnectKitButton.Custom>
  )
}
