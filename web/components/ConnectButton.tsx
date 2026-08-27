'use client'

import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { USDC_ERC20, arcTestnet } from '../lib/arc'
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

  const formattedUsdc = usdcBal !== undefined ? formatUnits(usdcBal as bigint, 6) : '0'

  if (isWrongNetwork) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isSwitching}
        aria-label="Switch network to Arc Testnet"
        className="min-h-[38px] sm:min-h-[42px] px-3 bg-rose-950/80 border border-rose-500/60 hover:bg-rose-900 text-rose-300 text-[11px] font-code-hash uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-rose-500 live-dot shrink-0" />
        <span className="font-bold">{isSwitching ? 'SWITCHING...' : 'WRONG NETWORK · SWITCH'}</span>
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
              type="button"
              disabled
              aria-label="Connecting to wallet"
              className="flex min-h-[38px] sm:min-h-[42px] items-center gap-2 border border-primary-fixed/40 bg-[#0c0f12] px-3 text-[11px] font-code-hash uppercase tracking-wider text-primary-fixed"
            >
              <div className="w-2 h-2 rounded-full bg-primary-fixed live-dot shrink-0" />
              <span className="hidden sm:inline">CONNECTING...</span>
              <span className="sm:hidden">WAIT</span>
            </button>
          )
        }

        return (
          <button
            type="button"
            onClick={show}
            aria-label={isConnected ? `Connected account: ${ensName ?? truncatedAddress}` : 'Connect Web3 Wallet'}
            aria-haspopup="dialog"
            className={`flex min-h-[38px] sm:min-h-[42px] min-w-0 items-center gap-2 border px-3 text-[11px] font-code-hash uppercase tracking-wider transition-colors cursor-pointer ${
              isConnected
                ? 'text-primary-fixed border-outline-border bg-[#0c0f12] hover:border-primary-fixed'
                : 'text-white border-primary-fixed bg-primary-fixed/10 hover:bg-primary-fixed/20'
            }`}
          >
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="hidden text-primary-fixed font-code-hash text-[11px] font-bold sm:inline">
                  {Number(formattedUsdc).toFixed(1)} USDC
                </span>
                <span className="hidden text-text-dim sm:inline">·</span>
                <span className="max-w-[100px] truncate text-white font-code-hash font-bold sm:max-w-none">
                  {ensName ?? truncatedAddress}
                </span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px] text-primary-fixed" aria-hidden="true">account_balance_wallet</span>
                <span className="font-bold">Connect Wallet</span>
              </>
            )}
          </button>
        )
      }}
    </ConnectKitButton.Custom>
  )
}
