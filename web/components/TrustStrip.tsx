'use client'

import { useState, useEffect } from 'react'
import { useBlockNumber } from 'wagmi'
import { arcTestnet } from '../lib/arc'
import { truncateAddress } from '../lib/format'

const PACT_ADDRESS = (process.env.NEXT_PUBLIC_PACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`

export default function TrustStrip({ lastUpdated, rpcError, onRetry }: { lastUpdated?: number; rpcError?: boolean; onRetry?: () => void }) {
  const { data: blockNumber, isError: blockError } = useBlockNumber({ watch: true, chainId: arcTestnet.id })
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [copiedAddr, setCopiedAddr] = useState(false)

  useEffect(() => {
    setSecondsAgo(0)
    const timer = setInterval(() => setSecondsAgo(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [lastUpdated, blockNumber])

  const handleCopy = () => {
    if (PACT_ADDRESS && PACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      navigator.clipboard.writeText(PACT_ADDRESS)
      setCopiedAddr(true)
      setTimeout(() => setCopiedAddr(false), 2000)
    }
  }

  const isConfigured = PACT_ADDRESS !== '0x0000000000000000000000000000000000000000'
  const hasError = rpcError || blockError

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 mb-5 rounded-md bg-zinc-900/50 border border-zinc-800/60 text-[11px] font-mono text-zinc-500">
      {/* Network dot + name */}
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${hasError ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse-dot'}`} />
        <span className="text-zinc-400">{arcTestnet.name}</span>
        <span className="text-zinc-600">·</span>
        <span>5042002</span>
      </span>

      {/* Contract */}
      {isConfigured && (
        <span className="flex items-center gap-1.5">
          <a
            href={`https://testnet.arcscan.app/address/${PACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-400 hover:text-emerald-400 transition-colors"
          >
            {truncateAddress(PACT_ADDRESS)}
          </a>
          <button onClick={handleCopy} className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">
            {copiedAddr ? '✓' : '⎘'}
          </button>
        </span>
      )}

      {/* Freshness */}
      <span className="ml-auto">
        {hasError ? (
          <span className="text-amber-400 flex items-center gap-1">
            RPC issue
            {onRetry && <button onClick={onRetry} className="underline hover:text-amber-300 cursor-pointer">retry</button>}
          </span>
        ) : (
          <span>{secondsAgo}s ago</span>
        )}
      </span>
    </div>
  )
}
