'use client'

import React, { useState, useRef, useEffect } from 'react'

export type ProtocolTermKey =
  | 'MAKER'
  | 'TAKER'
  | 'ARBITER'
  | 'COLLATERAL'
  | 'DISPUTE_BOND'
  | 'TERMS_HASH'
  | 'ARBITER_FEE_CAP'
  | 'PULL_CREDITS'

export interface TermDefinition {
  title: string
  shortDef: string
  details: string
}

export const PROTOCOL_GLOSSARY: Record<ProtocolTermKey, TermDefinition> = {
  MAKER: {
    title: 'Maker (Party A)',
    shortDef: 'The party who creates the pact and deposits initial escrow collateral.',
    details: 'Initiates the escrow agreement, commits written specifications, and locks funds in smart contract custody pending fulfillment.',
  },
  TAKER: {
    title: 'Taker (Party B / Counterparty)',
    shortDef: 'The counterparty who accepts the offer and performs the agreed obligations.',
    details: 'Accepts the pact by verifying written terms and depositing required counterparty collateral. Submits proof of delivery upon completion.',
  },
  ARBITER: {
    title: 'Arbiter (Neutral Mediator)',
    shortDef: 'The designated neutral third party with authority to rule on contested disputes.',
    details: 'Only activated if either party opens a dispute. Evaluates proof against written terms to award locked escrow and dispute bonds.',
  },
  COLLATERAL: {
    title: 'Escrow Collateral',
    shortDef: 'Assets locked securely in non-custodial smart contract custody.',
    details: 'Guarantees economic settlement. Funds can only be released via mutual agreement, unchallenged proof deadline, or arbiter ruling.',
  },
  DISPUTE_BOND: {
    title: 'Dispute Bond',
    shortDef: 'A security deposit (5% of notional valuation, min 1 USDC) required when filing a dispute.',
    details: 'Prevents frivolous disputes. The prevailing party receives their bond back plus compensation; the losing party forfeits their bond.',
  },
  TERMS_HASH: {
    title: 'Terms Hash',
    shortDef: 'A cryptographic SHA-256 / Keccak-256 fingerprint anchoring the written agreement on-chain.',
    details: 'Guarantees that neither party can alter the agreement terms after creation. Even a single changed character produces an invalid hash.',
  },
  ARBITER_FEE_CAP: {
    title: 'Arbiter Fee Cap',
    shortDef: 'The maximum allowable compensation claimable by the arbiter for resolving a dispute.',
    details: 'Committed at pact creation. Cannot exceed the 5% dispute bond amount. Unused portions remain with the dispute winner.',
  },
  PULL_CREDITS: {
    title: 'Pull-Payment Credits',
    shortDef: 'Claimable token balances held in the smart contract waiting for wallet withdrawal.',
    details: 'PACT uses the secure pull-payment pattern: funds are credited directly to your internal protocol balance and can be withdrawn at any time.',
  },
}

export default function ProtocolTerm({
  term,
  children,
  className = '',
}: {
  term: ProtocolTermKey
  children?: React.ReactNode
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const def = PROTOCOL_GLOSSARY[term]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!def) {
    return <span className={className}>{children}</span>
  }

  return (
    <span className="relative inline-flex items-center" ref={popoverRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(prev => !prev)
        }}
        aria-expanded={isOpen}
        aria-label={`Definition of ${def.title}: ${def.shortDef}`}
        className={`group inline-flex items-center gap-1 border-b border-dotted border-text-muted/60 hover:border-primary-fixed cursor-help text-inherit transition-colors focus-visible:ring-1 focus-visible:ring-primary-fixed outline-none ${className}`}
      >
        <span>{children ?? def.title}</span>
        <span className="text-[10px] text-text-dim group-hover:text-primary-fixed transition-colors select-none">
          ℹ
        </span>
      </button>

      {isOpen && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-1.5 z-50 w-72 sm:w-80 border border-outline-border bg-[#0c0f12] p-3 shadow-2xl animate-enter text-left"
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-outline-hairline">
            <span className="font-headline-mono text-[11px] font-bold uppercase tracking-wider text-primary-fixed">
              {def.title}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(false)
              }}
              className="text-text-dim hover:text-white text-[12px] p-0.5"
              aria-label="Close explanation"
            >
              ✕
            </button>
          </div>
          <p className="font-body-sans text-[11px] font-medium text-white leading-relaxed">
            {def.shortDef}
          </p>
          <p className="font-body-sans text-[10px] text-text-muted leading-relaxed mt-1">
            {def.details}
          </p>
        </div>
      )}
    </span>
  )
}
