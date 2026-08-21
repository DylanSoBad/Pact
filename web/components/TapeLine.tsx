'use client'

import Link from 'next/link'

export interface TapeLinePactProps {
  id: number
  time: string
  kind: string
  status: string
  amount: string
  address: string
  blurSize?: boolean
}

export default function TapeLine({ pact }: { pact: TapeLinePactProps }) {
  const isTerminal = ['CLEARED', 'SLASHED', 'EXPIRED', 'CANCELLED'].includes(pact.status)
  const isActive = ['ACTIVE', 'PROOF IN', 'OPEN', 'LIVE'].includes(pact.status)
  const isSlashed = pact.status === 'SLASHED'
  const isCleared = pact.status === 'CLEARED'
  
  const statusColorClass = isCleared 
    ? 'text-status-cleared' 
    : isActive 
    ? 'text-status-error pulse-live border border-status-error/30 rounded-sm px-1.5' 
    : isSlashed
    ? 'text-status-warning'
    : 'text-text-muted'

  const amountColorClass = isTerminal && !isCleared
    ? 'text-text-dim line-through opacity-50'
    : isCleared
    ? 'text-primary-fixed'
    : isActive
    ? 'text-on-surface'
    : 'text-text-muted'

  const bgClass = isActive ? 'bg-surface-container-low/20' : 'bg-transparent'

  return (
    <Link 
      href={`/p/${pact.id.toString()}`} 
      role="row"
      aria-label={`Pact #${pact.id}, kind ${pact.kind}, amount ${pact.amount}, status ${pact.status}`}
      className={`block border-b border-outline-hairline tape-row border-l-2 border-l-transparent focus-visible:ring-2 focus-visible:ring-primary-fixed focus-visible:outline-none ${bgClass}`}
    >
      {/* ─── Desktop 5-column Grid View (@md+) ─── */}
      <div className="hidden @md:grid grid-cols-5 gap-4 px-md py-3 items-center">
        <div role="cell" className="col-span-1 flex flex-col">
          <span className="text-text-muted font-body-mono">{pact.time}</span>
          <span className="text-on-surface font-headline-mono">#{pact.id.toString()}</span>
        </div>
        <div role="cell" className="col-span-1">
          <span className="px-1.5 py-0.5 bg-surface-container border border-outline-hairline text-text-dim rounded-sm font-body-mono uppercase text-xs">
            {pact.kind}
          </span>
        </div>
        <div role="cell" className="col-span-1 text-right flex items-center justify-end">
          <span className={`${amountColorClass} font-headline-mono truncate max-w-full`} title={pact.amount}>
            {pact.amount}
          </span>
        </div>
        <div role="cell" className="col-span-1 flex justify-center">
          <span className={`${statusColorClass} font-body-mono uppercase text-xs`}>
            [{pact.status}]
          </span>
        </div>
        <div role="cell" className="col-span-1 text-right">
          <span className="text-text-muted font-body-mono text-xs">
            {pact.address}
          </span>
        </div>
      </div>

      {/* ─── Mobile Spacious 2-Row Card View (< @md) ─── */}
      <div className="@md:hidden flex flex-col gap-2 px-3 py-3 font-code-hash">
        {/* Top Row: ID, Kind, Time -> Amount */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-on-surface font-headline-mono text-[14px]">#{pact.id.toString()}</span>
            <span className="px-1.5 py-0.5 bg-surface-container border border-outline-hairline text-text-dim rounded-sm font-body-mono uppercase text-[10px]">
              {pact.kind}
            </span>
            <span className="text-text-muted font-body-mono text-[11px]">{pact.time}</span>
          </div>
          <div className="text-right">
            <span className={`${amountColorClass} font-headline-mono text-[13px] font-bold`}>
              {pact.amount}
            </span>
          </div>
        </div>

        {/* Bottom Row: Status Badge -> Counterparty */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div>
            <span className={`${statusColorClass} font-body-mono uppercase text-[10px]`}>
              [{pact.status}]
            </span>
          </div>
          <div>
            <span className="text-text-muted font-body-mono text-[11px]">
              {pact.address}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
