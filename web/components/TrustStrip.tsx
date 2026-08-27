'use client'

import { useState } from 'react'
import { useBlockNumber } from 'wagmi'
import { arcTestnet } from '../lib/arc'
import { truncateAddress } from '../lib/format'
import { getPactAddress } from '../lib/arc'
import { useCurrentTime } from '../hooks/useCurrentTime'

const PACT_ADDRESS = getPactAddress()

export default function TrustStrip({
  lastUpdated,
  rpcError,
  onRetry,
}: {
  lastUpdated?: number
  rpcError?: boolean
  onRetry?: () => void
}) {
  const { data: blockNumber, isError: blockError } = useBlockNumber({ watch: true, chainId: arcTestnet.id })
  const currentTime = useCurrentTime()
  const [copied, setCopied] = useState(false)

  const updateRefTime = lastUpdated ? Math.floor(lastUpdated / 1000) : currentTime
  const secondsAgo = Math.max(0, currentTime - updateRefTime)

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
    <div className="flex items-center gap-3 text-[12px] text-zinc-500 mb-6 font-code-hash border-b border-outline-hairline/40 pb-3">
      <span
        className={`w-2 h-2 rounded-full ${hasError ? 'bg-amber-500' : 'bg-primary-fixed live-dot'}`}
        aria-hidden="true"
      />
      <span className="font-label-caps uppercase tracking-wider text-text-muted font-bold">
        {arcTestnet.name}
      </span>
      <span className="text-zinc-700">·</span>
      <span className="text-text-dim">Chain ID {arcTestnet.id}</span>
      {configured && (
        <>
          <span className="text-zinc-700">·</span>
          <button
            type="button"
            onClick={handleCopy}
            title="Click to copy PACT contract address"
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Contract: {copied ? <span className="text-primary-fixed font-bold">Copied!</span> : truncateAddress(PACT_ADDRESS!)}
          </button>
        </>
      )}
      <span className="ml-auto text-zinc-500 text-[11px]">
        {hasError ? (
          <button type="button" onClick={onRetry} className="text-amber-400 hover:text-amber-300 underline cursor-pointer">
            Reconnect RPC
          </button>
        ) : (
          <span>
            {blockNumber ? `Block #${blockNumber.toString()} · ` : ''}Synced {secondsAgo}s ago
          </span>
        )}
      </span>
    </div>
  )
}
