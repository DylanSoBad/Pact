'use client'

import React from 'react'

export type RoleType = 'MAKER' | 'TAKER' | 'ARBITER' | 'OBSERVER' | 'PUBLIC'

export interface RoleBadgeProps {
  role: RoleType
  isCurrentUser?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

export default function RoleBadge({
  role,
  isCurrentUser = false,
  size = 'sm',
  className = '',
}: RoleBadgeProps) {
  // Label and accessibility description
  let displayLabel = ''
  let ariaLabel = ''
  let roleTitle = ''

  switch (role) {
    case 'MAKER':
      displayLabel = isCurrentUser ? 'YOU (MAKER)' : 'MAKER'
      roleTitle = 'Deal Creator & Escrow Depositor'
      ariaLabel = isCurrentUser
        ? 'Your role: Maker (Deal Creator and Collateral Depositor)'
        : 'Role: Maker (Deal Creator and Collateral Depositor)'
      break
    case 'TAKER':
      displayLabel = isCurrentUser ? 'YOU (COUNTERPARTY)' : 'COUNTERPARTY'
      roleTitle = 'Designated Fulfiller & Counterparty'
      ariaLabel = isCurrentUser
        ? 'Your role: Counterparty (Designated Fulfiller)'
        : 'Role: Counterparty (Designated Fulfiller)'
      break
    case 'ARBITER':
      displayLabel = isCurrentUser ? 'YOU (ARBITER)' : 'DESIGNATED ARBITER'
      roleTitle = 'Neutral Mediator & Dispute Arbiter'
      ariaLabel = isCurrentUser
        ? 'Your role: Designated Arbiter (Neutral Dispute Mediator)'
        : 'Role: Designated Arbiter (Neutral Dispute Mediator)'
      break
    case 'OBSERVER':
    default:
      displayLabel = isCurrentUser ? 'YOU (OBSERVER)' : 'OBSERVER'
      roleTitle = 'Non-participant Third Party'
      ariaLabel = isCurrentUser
        ? 'Your role: Observer (Non-participant)'
        : 'Role: Observer (Non-participant)'
      break
  }

  // Size classes
  const sizeClasses = {
    xs: 'px-1.5 py-0.2 text-[8.5px] font-bold tracking-wider',
    sm: 'px-2 py-0.5 text-[9.5px] font-bold tracking-wider',
    md: 'px-2.5 py-1 text-[10.5px] font-bold tracking-wider',
    lg: 'px-3 py-1.5 text-[12px] font-bold tracking-wider',
  }[size]

  // Color & styling tokens
  let colorClasses = ''
  if (isCurrentUser) {
    switch (role) {
      case 'MAKER':
        colorClasses = 'bg-primary-fixed text-[#090b0d] border border-primary-fixed shadow-[0_0_8px_rgba(243,232,140,0.25)]'
        break
      case 'TAKER':
        colorClasses = 'bg-sky-400 text-[#082f49] border border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.25)]'
        break
      case 'ARBITER':
        colorClasses = 'bg-purple-400 text-[#2e1065] border border-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.25)]'
        break
      case 'OBSERVER':
      default:
        colorClasses = 'bg-outline-variant text-white border border-outline-border'
        break
    }
  } else {
    switch (role) {
      case 'MAKER':
        colorClasses = 'bg-primary-fixed/10 text-primary-fixed border border-primary-fixed/40'
        break
      case 'TAKER':
        colorClasses = 'bg-sky-950/40 text-sky-400 border border-sky-500/40'
        break
      case 'ARBITER':
        colorClasses = 'bg-purple-950/40 text-purple-400 border border-purple-500/40'
        break
      case 'OBSERVER':
      default:
        colorClasses = 'bg-[#12161b] text-text-muted border border-outline-border'
        break
    }
  }

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      title={roleTitle}
      className={`inline-flex items-center gap-1 font-label-caps uppercase select-none rounded-[1px] ${sizeClasses} ${colorClasses} ${className}`}
    >
      {isCurrentUser && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      )}
      <span>{displayLabel}</span>
    </span>
  )
}
