'use client'

import React from 'react'
import RoleBadge from './RoleBadge'
import AddressDisplay from './AddressDisplay'
import { formatAmount, tokenSymbol } from '../lib/format'

export interface PartyCardProps {
  role: 'MAKER' | 'TAKER' | 'ARBITER'
  address: string
  isCurrentUser: boolean
  collateralAmount?: bigint
  tokenAddress?: string
  feeCap?: bigint
  className?: string
}

export default function PartyCard({
  role,
  address,
  isCurrentUser,
  collateralAmount,
  tokenAddress,
  feeCap,
  className = '',
}: PartyCardProps) {
  let title = ''
  let obligationsText = ''

  switch (role) {
    case 'MAKER':
      title = 'Maker (Deal Creator)'
      obligationsText = 'Deposited collateral in escrow. Holds authorization to release funds upon satisfaction or open a dispute.'
      break
    case 'TAKER':
      title = 'Counterparty (Taker)'
      obligationsText = 'Designated fulfillment party. Obligated to submit delivery proof before the performance cutoff.'
      break
    case 'ARBITER':
      title = 'Designated Arbiter'
      obligationsText = 'Impartial dispute adjudicator. Issues binding rulings if contested with 5% USDC bonds.'
      break
  }

  const borderClass = isCurrentUser
    ? role === 'MAKER'
      ? 'border-primary-fixed/60 ring-1 ring-primary-fixed/20 bg-[#0c0f12]'
      : role === 'TAKER'
      ? 'border-sky-500/60 ring-1 ring-sky-500/20 bg-[#0c0f12]'
      : 'border-purple-500/60 ring-1 ring-purple-500/20 bg-[#0c0f12]'
    : 'border-outline-border bg-[#0c0f12]'

  return (
    <div className={`p-4 border flex flex-col justify-between transition-all ${borderClass} ${className}`}>
      <div>
        {/* Card Header: Role & YOU badge */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="font-label-caps text-[11px] uppercase tracking-wider text-text-muted font-bold">
            {title}
          </span>
          <RoleBadge role={role} isCurrentUser={isCurrentUser} size="sm" />
        </div>

        {/* Address Display with Copy & ArcScan */}
        <div className="mt-1">
          <AddressDisplay
            address={address}
            isCurrentUser={isCurrentUser}
            showCopy={true}
            showExplorer={true}
            showFullToggle={true}
          />
        </div>

        {/* Responsibilities Explanation */}
        <p className="mt-3 text-[11px] font-body-sans text-text-muted leading-relaxed">
          {obligationsText}
        </p>
      </div>

      {/* Financial Stake / Collateral Footer */}
      <div className="mt-4 pt-3 border-t border-outline-hairline flex items-center justify-between text-[11px] font-code-hash">
        <span className="text-text-dim uppercase text-[10px]">
          {role === 'ARBITER' ? 'Mediation Cap' : 'Committed Capital'}
        </span>
        {role === 'ARBITER' ? (
          <div className="text-right">
            <span className="text-text-muted font-bold block">
              {feeCap !== undefined ? `${formatAmount(feeCap)} USDC max` : '0 USDC'}
            </span>
            <span className="text-[9px] text-text-dim block">from loser&apos;s bond only</span>
          </div>
        ) : (
          <span className={role === 'MAKER' ? 'text-primary-fixed font-bold' : 'text-white font-bold'}>
            {collateralAmount !== undefined && collateralAmount > 0n
              ? `${formatAmount(collateralAmount)} ${tokenAddress ? tokenSymbol(tokenAddress) : ''}`
              : '0.00 Collateral'}
          </span>
        )}
      </div>
    </div>
  )
}
