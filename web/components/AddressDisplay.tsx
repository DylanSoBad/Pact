'use client'

import React, { useState } from 'react'

export interface AddressDisplayProps {
  address: string
  isCurrentUser?: boolean
  truncateChars?: number
  showCopy?: boolean
  showExplorer?: boolean
  showFullToggle?: boolean
  className?: string
}

export default function AddressDisplay({
  address,
  isCurrentUser = false,
  truncateChars = 4,
  showCopy = true,
  showExplorer = true,
  showFullToggle = false,
  className = '',
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false)
  const [showFull, setShowFull] = useState(false)

  if (!address) {
    return <span className="text-text-dim text-[11px] font-code-hash">N/A</span>
  }

  const visibleChars = Math.max(2, truncateChars)
  const formattedTruncated = address.length > visibleChars * 2 + 2
    ? `${address.slice(0, visibleChars + 2)}…${address.slice(-visibleChars)}`
    : address
  const arcscanUrl = `https://testnet.arcscan.app/address/${address}`

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback if clipboard API is blocked
      const textArea = document.createElement('textarea')
      textArea.value = address
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        {/* Address text */}
        <span
          className={`font-code-hash text-[12px] select-all ${
            isCurrentUser ? 'text-primary-fixed font-bold' : 'text-white'
          }`}
          title={address}
        >
          {showFull ? address : formattedTruncated}
        </span>

        {/* Copy Button */}
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Address copied to clipboard' : `Copy address ${address}`}
            className={`px-1.5 py-0.5 border text-[10px] font-label-caps uppercase transition-colors rounded-[1px] ${
              copied
                ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-400 font-bold'
                : 'border-outline-border bg-[#0c0f12] text-text-muted hover:text-white hover:border-outline-variant'
            }`}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        )}

        {/* ArcScan Link */}
        {showExplorer && (
          <a
            href={arcscanUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`View address ${address} on ArcScan explorer (opens in new tab)`}
            className="px-1.5 py-0.5 border border-outline-border bg-[#0c0f12] text-[10px] font-label-caps uppercase text-text-dim hover:text-primary-fixed hover:border-primary-fixed/40 transition-colors flex items-center gap-0.5 rounded-[1px]"
          >
            <span>ArcScan</span>
            <span className="text-[9px]">↗</span>
          </a>
        )}

        {/* Expand/Collapse Full Address Button */}
        {showFullToggle && (
          <button
            type="button"
            onClick={() => setShowFull(prev => !prev)}
            aria-label={showFull ? 'Collapse address' : 'Show full address'}
            className="px-1.5 py-0.5 border border-outline-border bg-[#0c0f12] text-[10px] font-label-caps uppercase text-text-dim hover:text-white transition-colors rounded-[1px]"
          >
            {showFull ? 'Short' : 'Full'}
          </button>
        )}

        {/* Accessibility screen-reader live announcement */}
        <span className="sr-only" aria-live="polite">
          {copied ? 'Address copied to clipboard' : ''}
        </span>
      </div>

      {/* Full address inline expand drawer if active */}
      {showFull && (
        <div className="mt-1 p-2 bg-[#07080a] border border-outline-hairline font-code-hash text-[11px] text-text-muted break-all select-all">
          {address}
        </div>
      )}
    </div>
  )
}
