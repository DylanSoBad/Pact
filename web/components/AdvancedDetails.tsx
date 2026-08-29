'use client'

import React, { useState } from 'react'
import AddressDisplay from './AddressDisplay'
import { arcTestnet } from '../lib/arc'

export interface AdvancedDetailsProps {
  contractAddress?: string | null
  tokenMaker?: string | null
  tokenTaker?: string | null
  termsHash?: string | null
  proofHash?: string | null
  pactId?: number | string | null
  chainId?: number | null
  rawTimestamps?: {
    createdAt?: bigint | string | number | null
    updatedAt?: bigint | string | number | null
    offerExpiry?: bigint | string | number | null
    performanceDeadline?: bigint | string | number | null
    disputeDeadline?: bigint | string | number | null
  }
  extraData?: Array<{ label: string; value: React.ReactNode }>
  defaultOpen?: boolean
}

export default function AdvancedDetails({
  contractAddress,
  tokenMaker,
  tokenTaker,
  termsHash,
  proofHash,
  pactId,
  chainId = arcTestnet.id,
  rawTimestamps,
  extraData,
  defaultOpen = false,
}: AdvancedDetailsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <section aria-label="Advanced On-Chain Details" className="border border-outline-border bg-[#0a0d10]">
      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        aria-controls="advanced-details-content"
        className="w-full flex items-center justify-between p-3 sm:p-4 text-left font-headline-mono text-[12px] uppercase tracking-wider text-text-muted hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-primary-fixed"
      >
        <span className="flex items-center gap-2">
          <span className="text-primary-fixed">{isOpen ? '▾' : '▸'}</span>
          <span>Advanced / On-Chain Details</span>
          <span className="text-[10px] text-text-dim lowercase font-body-sans">(hashes, calldata, addresses)</span>
        </span>
        <span className="text-[11px] font-code-hash text-text-dim">
          {isOpen ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {/* Expandable Content */}
      {isOpen && (
        <div id="advanced-details-content" className="border-t border-outline-hairline p-4 space-y-4 font-code-hash text-[11px] animate-enter">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Network & Addresses */}
            <div className="space-y-3">
              <h4 className="font-label-caps text-[10px] uppercase tracking-wider text-text-dim">
                Network & Core Contracts
              </h4>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 p-2 bg-[#07080a] border border-outline-hairline">
                  <span className="text-text-muted">Chain Network:</span>
                  <span className="text-white font-bold">Arc Testnet ({chainId ?? arcTestnet.id})</span>
                </div>

                {contractAddress && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">PACT Core Contract:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('contract', contractAddress)}
                        className="text-[10px] text-primary-fixed hover:underline"
                      >
                        {copiedKey === 'contract' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <AddressDisplay address={contractAddress} />
                  </div>
                )}

                {tokenMaker && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Maker Token Contract:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('tokenMaker', tokenMaker)}
                        className="text-[10px] text-primary-fixed hover:underline"
                      >
                        {copiedKey === 'tokenMaker' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <AddressDisplay address={tokenMaker} />
                  </div>
                )}

                {tokenTaker && tokenTaker !== '0x0000000000000000000000000000000000000000' && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Taker Token Contract:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('tokenTaker', tokenTaker)}
                        className="text-[10px] text-primary-fixed hover:underline"
                      >
                        {copiedKey === 'tokenTaker' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <AddressDisplay address={tokenTaker} />
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Cryptographic Hashes */}
            <div className="space-y-3">
              <h4 className="font-label-caps text-[10px] uppercase tracking-wider text-text-dim">
                Cryptographic Commitments
              </h4>

              <div className="space-y-2">
                {termsHash && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Committed Terms Hash (Keccak256):</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('termsHash', termsHash)}
                        className="text-[10px] text-primary-fixed hover:underline"
                      >
                        {copiedKey === 'termsHash' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[10px] text-white font-mono break-all select-all">
                      {termsHash}
                    </p>
                  </div>
                )}

                {proofHash && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Anchored Proof Hash (Sha256/Keccak):</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('proofHash', proofHash)}
                        className="text-[10px] text-primary-fixed hover:underline"
                      >
                        {copiedKey === 'proofHash' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[10px] text-white font-mono break-all select-all">
                      {proofHash}
                    </p>
                  </div>
                )}

                {pactId !== undefined && pactId !== null && (
                  <div className="flex items-center justify-between gap-2 p-2 bg-[#07080a] border border-outline-hairline">
                    <span className="text-text-muted">On-Chain Pact Storage ID:</span>
                    <span className="text-primary-fixed font-bold font-mono">#{String(pactId)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Raw Timestamps (if present) */}
          {rawTimestamps && (
            <div className="pt-2 border-t border-outline-hairline/60">
              <h4 className="font-label-caps text-[10px] uppercase tracking-wider text-text-dim mb-2">
                Raw Unix Epoch Timestamps
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {rawTimestamps.createdAt !== undefined && rawTimestamps.createdAt !== null && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline">
                    <span className="block text-text-dim text-[9px] uppercase">Created At</span>
                    <span className="text-white font-mono text-[10px]">{String(rawTimestamps.createdAt)}</span>
                  </div>
                )}
                {rawTimestamps.offerExpiry !== undefined && rawTimestamps.offerExpiry !== null && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline">
                    <span className="block text-text-dim text-[9px] uppercase">Offer Expiry</span>
                    <span className="text-white font-mono text-[10px]">{String(rawTimestamps.offerExpiry)}</span>
                  </div>
                )}
                {rawTimestamps.performanceDeadline !== undefined && rawTimestamps.performanceDeadline !== null && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline">
                    <span className="block text-text-dim text-[9px] uppercase">Perf Deadline</span>
                    <span className="text-white font-mono text-[10px]">{String(rawTimestamps.performanceDeadline)}</span>
                  </div>
                )}
                {rawTimestamps.disputeDeadline !== undefined && rawTimestamps.disputeDeadline !== null && (
                  <div className="p-2 bg-[#07080a] border border-outline-hairline">
                    <span className="block text-text-dim text-[9px] uppercase">Dispute Deadline</span>
                    <span className="text-white font-mono text-[10px]">{String(rawTimestamps.disputeDeadline)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Extra Custom Metadata (if any) */}
          {extraData && extraData.length > 0 && (
            <div className="pt-2 border-t border-outline-hairline/60 space-y-1">
              {extraData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-1.5 bg-[#07080a]">
                  <span className="text-text-muted">{item.label}:</span>
                  <span className="text-white font-mono">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
