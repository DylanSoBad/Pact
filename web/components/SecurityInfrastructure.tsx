'use client'

import { useState } from 'react'
import { getPactAddress, arcTestnet, CIRCLE_FAUCET_URL } from '../lib/arc'
import { truncateAddress } from '../lib/format'
import { Copy, Check, ExternalLink, ShieldCheck, FileCode, Cpu, Lock } from 'lucide-react'

const REPOSITORY_URL = 'https://github.com/DylanSoBad/Pact'
const DOCS_URL = `${REPOSITORY_URL}/tree/main/docs`

export default function SecurityInfrastructure() {
  const [copied, setCopied] = useState(false)
  const contractAddress = getPactAddress() ?? '0x0000000000000000000000000000000000000000'
  const explorerUrl = `https://testnet.arcscan.app/address/${contractAddress}`

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && contractAddress) {
      navigator.clipboard.writeText(contractAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <section
      aria-label="Security and Contract Verification"
      className="relative w-full border-b border-outline-hairline bg-[#07080a] py-16 sm:py-20"
    >
      <div className="mx-auto max-w-[1368px] px-4 sm:px-8 lg:px-14">
        {/* Section Header */}
        <header className="mb-12 max-w-3xl">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-[1px] bg-primary-fixed" />
            <p className="font-label-caps text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fixed">
              Infrastructure & Verification
            </p>
          </div>
          <h2 className="mt-3 font-editorial text-[28px] font-normal leading-[1.15] tracking-[-0.025em] text-[#f4f5f7] sm:text-[36px]">
            Verify the infrastructure.
          </h2>
          <p className="mt-2 font-body-sans text-[13px] text-text-muted">
            All escrow state, collateral authorizations, and resolution logic execute through deterministic smart contracts on Arc Testnet.
          </p>
        </header>

        {/* Technical Architecture Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Network & Chain */}
          <article className="pact-security-card rounded-[2px] p-5">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                Deployment Network
              </span>
              <Cpu aria-hidden="true" className="h-4 w-4 text-primary-fixed" />
            </div>
            <p className="mt-4 font-headline-mono text-[16px] font-bold text-white">
              {arcTestnet.name}
            </p>
            <div className="mt-2 space-y-1 font-code-hash text-[11px] text-text-muted">
              <p>Chain ID: <span className="text-white font-bold">{arcTestnet.id}</span></p>
              <p>Currency: <span className="text-white">USDC (Native Gas)</span></p>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-hairline">
              <a
                href={CIRCLE_FAUCET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-label-caps text-[10px] uppercase tracking-wider text-primary-fixed hover:text-white transition-colors"
              >
                <span>Circle Testnet Faucet</span>
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            </div>
          </article>

          {/* Card 2: Smart Contract Core */}
          <article className="pact-security-card rounded-[2px] p-5">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                PACT Core Vault
              </span>
              <FileCode aria-hidden="true" className="h-4 w-4 text-primary-fixed" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <code className="font-code-hash text-[12px] font-bold text-white">
                {truncateAddress(contractAddress)}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? 'Address copied to clipboard' : 'Copy contract address'}
                className="flex h-7 w-7 items-center justify-center rounded-[1px] border border-outline-border bg-[#12161b] text-text-muted hover:border-primary-fixed hover:text-primary-fixed transition-colors"
              >
                {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary-fixed" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-2 font-body-sans text-[11px] text-text-dim leading-4">
              Non-custodial smart contract with atomic lock & dispute windows.
            </p>
            <div className="mt-4 pt-3 border-t border-outline-hairline">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-label-caps text-[10px] uppercase tracking-wider text-primary-fixed hover:text-white transition-colors"
              >
                <span>View on ArcScan</span>
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            </div>
          </article>

          {/* Card 3: Cryptographic Integrity */}
          <article className="pact-security-card rounded-[2px] p-5">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                Terms Anchoring
              </span>
              <Lock aria-hidden="true" className="h-4 w-4 text-primary-fixed" />
            </div>
            <p className="mt-4 font-headline-mono text-[16px] font-bold text-white">
              SHA-256 Digest
            </p>
            <p className="mt-2 font-body-sans text-[11px] text-text-muted leading-4">
              Written terms are hashed into an immutable 32-byte commitment. Exact text is verified on-chain during disputes.
            </p>
            <div className="mt-4 pt-3 border-t border-outline-hairline">
              <span className="font-code-hash text-[10px] text-text-dim">
                Exact ERC-20 Permit / Allowances
              </span>
            </div>
          </article>

          {/* Card 4: Audit & Open Source */}
          <article className="pact-security-card rounded-[2px] p-5">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                Security Assurance
              </span>
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary-fixed" />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <p className="font-headline-mono text-[14px] font-bold text-white">
                Audit: planned
              </p>
            </div>
            <p className="mt-2 font-body-sans text-[11px] text-text-dim leading-4">
              Testnet environment · Smart contracts are fully open-source and deterministic.
            </p>
            <div className="mt-4 pt-3 border-t border-outline-hairline flex items-center gap-3">
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-label-caps text-[10px] uppercase tracking-wider text-text-muted hover:text-primary-fixed transition-colors"
              >
                <span>Docs</span>
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-label-caps text-[10px] uppercase tracking-wider text-text-muted hover:text-primary-fixed transition-colors"
              >
                <span>Source</span>
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
