'use client'

import { useState, useEffect } from 'react'
import { useBlockNumber } from 'wagmi'
import { arcTestnet } from '../lib/arc'
import { truncateAddress } from '../lib/format'

import { getPactAddress } from '../lib/arc'

const PACT_ADDRESS = getPactAddress()

export default function TrustStrip({ lastUpdated, rpcError, onRetry }: { lastUpdated?: number; rpcError?: boolean; onRetry?: () => void }) {
  const { data: blockNumber, isError: blockError } = useBlockNumber({ watch: true, chainId: arcTestnet.id })
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setSecondsAgo(0)
    const t = setInterval(() => setSecondsAgo(p => p + 1), 1000)
    return () => clearInterval(t)
  }, [lastUpdated, blockNumber])

  const handleCopy = () => {
    if (PACT_ADDRESS) {
      navigator.clipboard.writeText(PACT_ADDRESS)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const hasError = rpcError || blockError
  const configured = Boolean(PACT_ADDRESS)

  return (
    <div className="flex items-center gap-3 text-[12px] text-zinc-600 mb-8 font-mono">
      <span className={`w-[8px] h-[8px] ${hasError ? 'bg-amber-500' : 'bg-[#c8f542] animate-pulse-soft'}`} />
      <span className="uppercase tracking-widest">{arcTestnet.name}</span>
      <span className="text-zinc-700">·</span>
      <span>{arcTestnet.id}</span>
      {configured && (
        <>
          <span className="text-zinc-700">·</span>
          <button onClick={handleCopy} className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
            {copied ? 'copied' : truncateAddress(PACT_ADDRESS!)}
          </button>
        </>
      )}
      <span className="ml-auto text-zinc-700">
        {hasError ? (
          <button onClick={onRetry} className="text-amber-500 hover:text-amber-400 cursor-pointer">reconnect</button>
        ) : (
          `${secondsAgo}s ago`
        )}
      </span>
    </div>
  )
}
