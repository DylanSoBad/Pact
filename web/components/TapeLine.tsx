'use client'

import Link from 'next/link'

export default function TapeLine({ pact }: { pact: any }) {
  const isTerminal = ['CLEARED', 'SLASHED', 'EXPIRED', 'CANCELLED'].includes(pact.status)
  const isActive = ['ACTIVE', 'PROOF IN'].includes(pact.status)
  const isSlashed = pact.status === 'SLASHED'
  const isCleared = pact.status === 'CLEARED'
  
  const statusColorClass = isCleared 
    ? 'text-status-cleared' 
    : isActive 
    ? 'text-status-error pulse-live border border-status-error/30 rounded-sm px-2' 
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

  const bgClass = isActive ? 'bg-surface-container-low/30' : 'bg-transparent'

  return (
    <Link href={`/p/${pact.id.toString()}`} className={`grid grid-cols-5 gap-4 px-md py-3 border-b border-outline-hairline tape-row items-center border-l-2 border-l-transparent ${bgClass}`}>
      <div className="col-span-1 flex flex-col">
        <span className="text-text-muted font-body-mono">{pact.time}</span>
        <span className="text-on-surface font-headline-mono">#{pact.id.toString()}</span>
      </div>
      <div className="col-span-1">
        <span className="px-1.5 py-0.5 bg-surface-container border border-outline-hairline text-text-dim rounded-sm font-body-mono uppercase">
          {pact.kind}
        </span>
      </div>
      <div className="col-span-1 text-right flex items-center justify-end">
        <span className={`${amountColorClass} font-headline-mono truncate max-w-full`} title={pact.amount}>
          {pact.amount}
        </span>
      </div>
      <div className="col-span-1 flex justify-center">
        <span className={`${statusColorClass} font-body-mono uppercase`}>
          [{pact.status}]
        </span>
      </div>
      <div className="col-span-1 text-right">
        <span className="text-text-muted font-body-mono">
          {pact.address}
        </span>
      </div>
    </Link>
  )
}
