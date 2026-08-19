'use client'

import Link from 'next/link'

export default function TapeLine({ pact }: { pact: any }) {
  const isTerminal = ['CLEARED', 'SLASHED', 'EXPIRED', 'CANCELLED'].includes(pact.status)
  const isActive = ['ACTIVE', 'PROOF IN'].includes(pact.status)
  const isProofIn = pact.status === 'PROOF IN'
  
  const statusColor = isTerminal
    ? 'text-zinc-600'
    : isActive
    ? 'text-[#c8f542]'
    : 'text-zinc-400'

  return (
    <Link href={`/p/${pact.id.toString()}`} className="group block border-b border-zinc-800 hover:bg-[#0c0d10] transition-none">
      <div className="flex flex-col @md:flex-row @md:items-center justify-between py-3 px-2 gap-3">
        {/* Left: ID, Archetype, Status */}
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-zinc-500 font-mono tabular-nums">
            {pact.id.toString().padStart(4, '0')}
          </span>

          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest w-16">
            {pact.kind}
          </span>

          <span className={`text-[11px] font-mono font-bold tracking-wider flex items-center gap-2 ${statusColor} w-24`}>
            {isActive && (
              <span className={`w-1.5 h-1.5 rounded-none ${isProofIn ? 'bg-amber-400' : 'bg-[#c8f542] animate-pulse'}`} />
            )}
            [{pact.status}]
          </span>
        </div>

        {/* Right: Locked Amount, Maker Address */}
        <div className="flex items-center justify-between @md:justify-end gap-6">
          <div className="text-[13px] text-zinc-400 font-mono">
            {pact.address}
          </div>
          <div className="text-[13px] font-bold text-white tabular-nums font-mono min-w-[120px] text-right">
            {pact.amount}
          </div>
        </div>
      </div>
    </Link>
  )
}
