'use client'

import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { getDeadlineStatus } from '../lib/countdown'
import type { PactData } from '../lib/reads'
import { getPrimaryUserAction } from '../lib/actionMatrix'

export interface TapeLinePactProps {
  id: number
  time: string
  kind: string
  status: string
  amount: string
  address: string
  blurSize?: boolean
  deadlineTs?: bigint | number
  deadlineLabel?: string
  rawPact?: PactData
}

function getStatusStyle(status: string) {
  const norm = status.toUpperCase()
  if (norm === 'SETTLED' || norm === 'CLEARED') {
    return 'text-emerald-400 border border-emerald-500/30 bg-emerald-950/20'
  }
  if (norm === 'ACTIVE' || norm === 'LIVE') {
    return 'text-primary-fixed border border-primary-fixed/40 bg-primary-fixed/10 font-bold'
  }
  if (norm === 'PROOF IN' || norm === 'PROOF_SUBMITTED') {
    return 'text-purple-300 border border-purple-500/30 bg-purple-950/20'
  }
  if (norm === 'DISPUTED') {
    return 'text-amber-400 border border-amber-500/40 bg-amber-950/30 font-bold'
  }
  if (norm === 'OFFERED') {
    return 'text-sky-400 border border-sky-500/30 bg-sky-950/20'
  }
  if (norm === 'EXPIRED') {
    return 'text-rose-400 border border-rose-500/40 bg-rose-950/25 font-bold'
  }
  if (norm === 'CANCELLED') {
    return 'text-zinc-400 border border-zinc-700/40 bg-zinc-900/30'
  }
  return 'text-slate-400 border border-slate-700/40 bg-slate-900/30'
}

export default function TapeLine({ pact }: { pact: TapeLinePactProps }) {
  const { address } = useAccount()
  const currentTime = useCurrentTime()
  const normStatus = pact.status.toUpperCase()
  const isTerminal = ['SETTLED', 'EXPIRED', 'CANCELLED'].includes(normStatus)
  const isSettled = normStatus === 'SETTLED'
  const isDisputed = normStatus === 'DISPUTED'

  const deadlineStatus = pact.deadlineTs && !isTerminal
    ? getDeadlineStatus(pact.deadlineTs, currentTime)
    : null

  const isUrgent = deadlineStatus?.isUrgent || false
  const isPast = deadlineStatus?.isExpired || normStatus === 'EXPIRED'

  const userAction = pact.rawPact
    ? getPrimaryUserAction(pact.rawPact, null, address, BigInt(currentTime))
    : null

  const hasUserAction = Boolean(userAction && userAction.isEligible)

  const amountColor = isSettled
    ? 'text-emerald-400 font-bold'
    : isDisputed
    ? 'text-amber-400 font-bold'
    : isTerminal
    ? 'text-text-dim line-through opacity-60'
    : 'text-on-surface font-bold'

  // Row ambient border when action due, closing soon, or expired
  const rowHighlight = hasUserAction
    ? 'border-primary-fixed/50 bg-primary-fixed/[0.04] hover:bg-primary-fixed/[0.08]'
    : isUrgent
    ? 'border-orange-500/40 bg-orange-950/10 hover:bg-orange-950/20'
    : isPast && !isSettled
    ? 'border-rose-500/30 bg-rose-950/5 hover:bg-rose-950/15'
    : 'border-outline-hairline/60 bg-transparent hover:bg-surface-container/60'

  return (
    <Link
      href={`/p/${pact.id.toString()}`}
      aria-label={`Pact #${pact.id}, kind ${pact.kind}, amount ${pact.amount}, status ${pact.status}${deadlineStatus ? `, deadline ${deadlineStatus.compactFormatted}` : ''}${userAction ? `, action: ${userAction.label}` : ''}`}
      className={`tape-row pact-tape-row-enter block border-b transition-colors focus-visible:ring-2 focus-visible:ring-primary-fixed ${rowHighlight}`}
      style={{ animationDelay: `${Math.min(pact.id % 8, 7) * 65}ms` }}
    >
      <div className="hidden min-h-[90px] md:grid grid-cols-12 gap-4 px-5 py-4 items-center font-code-hash text-[12px]">
        <div className="col-span-5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-dim">PACT-{String(pact.id).padStart(4, '0')}</span>
            <span className="text-[9px] uppercase tracking-wider text-text-muted">{pact.kind}</span>
          </div>
          <p className="mt-1 truncate font-body-sans text-[13px] font-semibold text-white">Verifiable {pact.kind.toLowerCase()} agreement</p>
          <p className="mt-1 truncate text-[10px] text-text-dim">{pact.address} · updated {pact.time}</p>
        </div>

        <div className="col-span-2">
          <span className={`inline-block px-2 py-1 text-[9px] font-label-caps uppercase tracking-wider ${getStatusStyle(pact.status)}`}>
            {pact.status}
          </span>
          {hasUserAction && <span className="mt-2 block text-[9px] font-bold text-primary-fixed">⚡ {userAction?.shortLabel}</span>}
        </div>

        <div className="col-span-3">
          <span className={`${amountColor} text-[13px] truncate block`} title={pact.amount}>
            {pact.amount}
          </span>
          <span className="mt-2 block h-1 w-24 overflow-hidden bg-outline-border" aria-hidden="true">
            <span className="pact-collateral-progress block h-full w-2/3 origin-left bg-primary-fixed" />
          </span>
        </div>

        <div className="col-span-2 text-right text-[10px] text-text-muted">
          {deadlineStatus ? <span title={deadlineStatus.ariaLabel}>{deadlineStatus.compactFormatted}</span> : <span>{pact.time}</span>}
        </div>
      </div>

      {/* Mobile Structured 2-Row Card (< md) */}
      <div className="md:hidden flex flex-col gap-2 p-3 font-code-hash">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-headline-mono text-[14px] font-bold text-white">
              #{String(pact.id).padStart(4, '0')}
            </span>
            <span className="px-1.5 py-0.5 border border-outline-border bg-[#0c0f12] text-[9px] font-label-caps uppercase tracking-wider text-text-muted">
              {pact.kind}
            </span>
            {deadlineStatus ? (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${deadlineStatus.badgeStyle}`}>
                <span>{deadlineStatus.compactFormatted}</span>
              </span>
            ) : (
              <span className="text-[10px] text-text-dim">
                {pact.time}
              </span>
            )}
            {hasUserAction && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-primary-fixed/60 bg-primary-fixed/20 text-primary-fixed font-bold text-[9px] font-label-caps uppercase">
                ⚡ {userAction?.shortLabel}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className={`${amountColor} text-[13px]`}>
              {pact.amount}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-hairline/30">
          <span className={`px-2 py-0.5 text-[9px] font-label-caps uppercase tracking-wider ${getStatusStyle(pact.status)}`}>
            {pact.status}
          </span>
          <span className="text-[11px] text-text-dim truncate max-w-[180px]">
            Maker: <span className="text-text-muted">{pact.address}</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
