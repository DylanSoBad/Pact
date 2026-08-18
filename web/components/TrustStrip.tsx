'use client'

import { useState, useEffect } from 'react'
import { useBlockNumber } from 'wagmi'
import { arcTestnet, USDC_ERC20 } from '../lib/arc'
import { truncateAddress } from '../lib/format'

const PACT_ADDRESS = (process.env.NEXT_PUBLIC_PACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`

export default function TrustStrip({ lastUpdated, rpcError, onRetry }: { lastUpdated?: number; rpcError?: boolean; onRetry?: () => void }) {
  const { data: blockNumber, isError: blockError } = useBlockNumber({ watch: true, chainId: arcTestnet.id })
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [copiedAddr, setCopiedAddr] = useState(false)

  useEffect(() => {
    setSecondsAgo(0)
    const timer = setInterval(() => {
      setSecondsAgo(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [lastUpdated, blockNumber])

  const handleCopyContract = () => {
    if (PACT_ADDRESS && PACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      navigator.clipboard.writeText(PACT_ADDRESS)
      setCopiedAddr(true)
      setTimeout(() => setCopiedAddr(false), 2000)
    }
  }

  const isConfigured = PACT_ADDRESS && PACT_ADDRESS !== '0x0000000000000000000000000000000000000000'

  return (
    <div className="bg-[#0e0f12] border border-[#1e1f25] rounded-md px-3.5 py-2 mb-6 flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-[11px] font-mono shadow-sm">
      {/* Network & Chain ID */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
          <span className={`w-1.5 h-1.5 rounded-full ${rpcError || blockError ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
          <span>{arcTestnet.name}</span>
        </span>
        <span className="text-zinc-500 font-normal">
          (ID: <span className="text-zinc-400 font-medium">5042002</span>)
        </span>
      </div>

      {/* Contract Address with Copy & ArcScan Link */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 uppercase">Contract:</span>
        {isConfigured ? (
          <div className="flex items-center gap-1.5 bg-[#141518] px-2 py-0.5 rounded border border-[#222328]">
            <a
              href={`https://testnet.arcscan.app/address/${PACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-300 hover:text-emerald-400 transition-colors font-medium"
              title="Inspect contract on ArcScan"
            >
              {truncateAddress(PACT_ADDRESS)} ↗
            </a>
            <button
              onClick={handleCopyContract}
              className="text-zinc-500 hover:text-zinc-300 text-[10px] transition-colors cursor-pointer"
              title="Copy full address"
            >
              {copiedAddr ? '✓' : '⎘'}
            </button>
          </div>
        ) : (
          <span className="text-zinc-500 italic bg-[#141518] px-2 py-0.5 rounded border border-[#222328]">
            Local / Testnet Env
          </span>
        )}
      </div>

      {/* RPC Status & Latency / Last Block */}
      <div className="flex items-center gap-3">
        {rpcError ? (
          <div className="flex items-center gap-1.5 text-amber-400">
            <span>⚠️ RPC Latency</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="underline hover:text-amber-300 transition-colors cursor-pointer ml-1"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-zinc-400">
            {blockNumber ? (
              <span className="text-zinc-500 hidden sm:inline">
                Block <strong className="text-zinc-400 font-medium">#{blockNumber.toString()}</strong>
              </span>
            ) : null}
            <span className="text-zinc-500">
              Updated <strong className="text-zinc-300 font-medium">{secondsAgo}s ago</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
