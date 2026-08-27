'use client'

import { useState } from 'react'
import { CanonicalPactTerms, hashPactTerms, hashTerms, verifyPactTerms } from '../lib/terms'
import { formatAmount, formatDate, kindLabel, tokenSymbol, truncateAddress } from '../lib/format'
import AddressDisplay from './AddressDisplay'
import RoleBadge from './RoleBadge'

export interface TermsVerifierProps {
  canonicalTerms: CanonicalPactTerms | null
  onChainTermsHash: `0x${string}`
  plaintextTerms: string
  onPlaintextChange: (newText: string) => void
  isTaker: boolean
  isReadOnly?: boolean
}

export default function TermsVerifier({
  canonicalTerms,
  onChainTermsHash,
  plaintextTerms,
  onPlaintextChange,
  isTaker,
  isReadOnly = false,
}: TermsVerifierProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)

  const hasInput = Boolean(plaintextTerms.trim())
  const computedHash = canonicalTerms && hasInput ? hashPactTerms(canonicalTerms, plaintextTerms) : null
  const isMatch = Boolean(computedHash && computedHash.toLowerCase() === onChainTermsHash.toLowerCase())
  const isMismatch = Boolean(hasInput && computedHash && computedHash.toLowerCase() !== onChainTermsHash.toLowerCase())

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  return (
    <section
      aria-label="Cryptographic Terms Verifier"
      className={`border transition-colors p-5 space-y-5 animate-enter ${
        isMatch
          ? 'border-emerald-500/50 bg-emerald-950/10 shadow-[0_0_20px_rgba(52,211,153,0.08)]'
          : isMismatch
          ? 'border-rose-500/60 bg-rose-950/20 shadow-[0_0_20px_rgba(244,63,94,0.12)]'
          : 'border-outline-border bg-[#0c0f12]'
      }`}
    >
      {/* Header & Match Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-hairline">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-[20px] ${
            isMatch ? 'text-emerald-400' : isMismatch ? 'text-rose-400' : 'text-primary-fixed'
          }`}>
            {isMatch ? 'verified_user' : isMismatch ? 'gpp_bad' : 'fingerprint'}
          </span>
          <div>
            <h2 className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">
              Terms & Fingerprint Verification
            </h2>
            <p className="text-[11px] text-text-dim font-body-sans">
              Cryptographically verify all deal obligations and written terms before accepting.
            </p>
          </div>
        </div>

        {/* Verification Status Pill */}
        <div>
          {isMatch ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 border border-emerald-500/50 bg-emerald-950/40 text-emerald-400 text-[11px] font-label-caps uppercase font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
              ✓ 100% Cryptographic Match
            </span>
          ) : isMismatch ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 border border-rose-500/60 bg-rose-950/50 text-rose-300 text-[11px] font-label-caps uppercase font-bold tracking-wider animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              ❌ Terms Mismatch Detected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border border-outline-hairline bg-[#07080a] text-text-muted text-[10px] font-label-caps uppercase">
              Awaiting Plaintext Verification
            </span>
          )}
        </div>
      </div>

      {/* Mismatch Alert Box */}
      {isMismatch && (
        <div className="p-4 border border-rose-500/60 bg-rose-950/30 text-[12px] space-y-2 text-rose-200">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            <span>CRITICAL WARNING: TERMS HASH MISMATCH</span>
          </div>
          <p className="leading-relaxed">
            The agreement text you provided <strong>does not match</strong> the cryptographic hash committed on-chain by the Maker. If you accept, the smart contract will reject the transaction, or you may be agreeing to terms different from what you see.
          </p>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-300 font-code-hash">
            <li>Check if any words, punctuation, or spaces were modified.</li>
            <li>Confirm with Maker that they provided the exact original terms string.</li>
            <li>Acceptance is automatically <strong>blocked</strong> by PACT security safeguards.</li>
          </ul>
        </div>
      )}

      {/* Match Confirmation Box */}
      {isMatch && (
        <div className="p-3.5 border border-emerald-500/40 bg-emerald-950/20 text-[12px] font-body-sans text-emerald-200 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-emerald-400 text-[20px] shrink-0">check_circle</span>
          <div>
            <strong className="text-white">Tamper-Proof Guarantee:</strong> The provided plaintext agreement, party addresses, collaterals, and cutoffs match the on-chain commitment byte-for-byte.
          </div>
        </div>
      )}

      {/* 1. Human-Readable Deal Summary Matrix */}
      {canonicalTerms && (
        <div className="space-y-3">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
            1. Human-Readable Agreement Breakdown
          </span>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 font-code-hash text-[11px]">
            {/* Agreement Kind & Collateral */}
            <div className="p-3 bg-[#07080a] border border-outline-hairline space-y-1.5">
              <span className="text-[10px] uppercase text-text-dim block">Model & Token</span>
              <div className="text-white font-bold text-[12px]">
                {canonicalTerms.kind === 0 ? 'Delivery Escrow' : 'Job & Milestone Bounty'}
              </div>
              <div className="text-text-muted">
                Maker Escrow: <strong className="text-primary-fixed">{formatAmount(canonicalTerms.amountMaker)} {tokenSymbol(canonicalTerms.tokenMaker)}</strong>
              </div>
              <div className="text-text-muted">
                Taker Deposit: <strong className="text-white">{canonicalTerms.amountTaker > 0n ? `${formatAmount(canonicalTerms.amountTaker)} ${tokenSymbol(canonicalTerms.tokenTaker)}` : 'None (0.00)'}</strong>
              </div>
            </div>

            {/* Parties Summary */}
            <div className="p-3 bg-[#07080a] border border-outline-hairline space-y-1.5">
              <span className="text-[10px] uppercase text-text-dim block">Bound Parties</span>
              <div className="flex items-center justify-between">
                <span className="text-text-dim">Maker:</span>
                <AddressDisplay address={canonicalTerms.maker} showCopy={false} showExplorer={false} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-dim">Counterparty:</span>
                <AddressDisplay address={canonicalTerms.taker} showCopy={false} showExplorer={false} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-dim">Arbiter:</span>
                <AddressDisplay address={canonicalTerms.arbiter} showCopy={false} showExplorer={false} />
              </div>
            </div>

            {/* Committed Deadlines */}
            <div className="p-3 bg-[#07080a] border border-outline-hairline space-y-1.5 sm:col-span-2 lg:col-span-1">
              <span className="text-[10px] uppercase text-text-dim block">Binding Cutoffs</span>
              <div className="flex justify-between">
                <span className="text-text-dim">Offer Cutoff:</span>
                <span className="text-white">{formatDate(canonicalTerms.offerExpiry)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">Performance:</span>
                <span className="text-white">{formatDate(canonicalTerms.performanceDeadline)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">Dispute Cutoff:</span>
                <span className="text-white">{formatDate(canonicalTerms.disputeDeadline)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Written Agreement Text Verifier Area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="pact-terms-plaintext-input" className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
            2. Written Agreement Text (Plaintext)
          </label>
          <span className="text-[10px] font-code-hash text-text-dim">
            {plaintextTerms.length} characters
          </span>
        </div>

        <textarea
          id="pact-terms-plaintext-input"
          value={plaintextTerms}
          onChange={e => onPlaintextChange(e.target.value)}
          readOnly={isReadOnly}
          rows={4}
          placeholder={
            isTaker
              ? "Paste the written agreement plaintext provided by the Maker to verify cryptographic match against on-chain termsHash before accepting..."
              : "Plaintext agreement terms..."
          }
          className="w-full border border-outline-border bg-[#07080a] p-3 text-[12px] font-code-hash text-white outline-none focus:border-primary-fixed resize-y"
        />
      </div>

      {/* 3. Advanced Cryptographic Fingerprint Accordion */}
      <div className="border border-outline-hairline bg-[#07080a] p-3.5 space-y-3">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full text-left font-label-caps text-[11px] uppercase tracking-wider text-text-muted hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-primary-fixed">key</span>
            Advanced Cryptographic Fingerprint Details
          </span>
          <span className="text-text-dim font-code-hash">
            {showAdvanced ? 'Hide ▲' : 'Show Details ▼'}
          </span>
        </button>

        {showAdvanced && (
          <div className="pt-2 border-t border-outline-hairline space-y-3 text-[11px] font-code-hash">
            <p className="text-[11px] font-body-sans text-text-muted leading-relaxed">
              💡 <strong>How it works:</strong> The Terms Hash is an immutable SHA-256 fingerprint generated from all 16 contract parameters and the UTF-8 hash of your written text. The contract guarantees that neither party can secretly modify any term without invalidating this hash.
            </p>

            <div className="space-y-1.5">
              <span className="text-text-dim uppercase text-[10px] block">On-Chain Commitment Hash:</span>
              <div className="flex items-center gap-2">
                <span className="flex-1 p-2 bg-[#0c0f12] border border-outline-hairline text-primary-fixed break-all select-all">
                  {onChainTermsHash}
                </span>
                <button
                  type="button"
                  onClick={() => copyHash(onChainTermsHash)}
                  className="px-2.5 py-2 border border-outline-border bg-[#12161b] text-text-muted hover:text-white text-[10px] uppercase font-label-caps shrink-0"
                >
                  {copiedHash ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            </div>

            {computedHash && (
              <div className="space-y-1.5">
                <span className="text-text-dim uppercase text-[10px] block">Computed Local Hash:</span>
                <div className={`p-2 border break-all select-all ${
                  isMatch
                    ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-950/20 text-rose-300'
                }`}>
                  {computedHash}
                </div>
              </div>
            )}

            {hasInput && (
              <div className="space-y-1.5">
                <span className="text-text-dim uppercase text-[10px] block">Document Text Keccak-256 Hash:</span>
                <div className="p-2 bg-[#0c0f12] border border-outline-hairline text-text-muted break-all select-all">
                  {hashTerms(plaintextTerms)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
