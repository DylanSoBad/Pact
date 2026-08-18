'use client'

import Link from 'next/link'

export default function TapeLine({ pact }: { pact: any }) {
  const statusStyle = (status: string) => {
    switch (status) {
      case 'LIVE':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      case 'CLEARED':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      case 'SLASHED':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20'
      case 'PROOF IN':
        return 'text-emerald-300 bg-emerald-500/8 border-emerald-500/20'
      default:
        return 'text-zinc-400 bg-zinc-800/60 border-zinc-700/40'
    }
  }

  const isLive = pact.status === 'LIVE' || pact.status === 'PROOF IN'

  return (
    <Link href={`/p/${pact.id.toString()}`} className="group block">
      <div className="flex items-center justify-between py-3 px-4 border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
        {/* Left: ID + Kind + Status */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors w-11 shrink-0">
            #{pact.id.toString().padStart(4, '0')}
          </span>
          <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline shrink-0">
            {pact.kind}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium border shrink-0 ${statusStyle(pact.status)}`}>
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot" />}
            {pact.status}
          </span>
        </div>

        {/* Right: Amount + Address */}
        <div className="flex items-center gap-4 shrink-0">
          {pact.blurSize ? (
            <span className="text-[11px] font-mono text-zinc-600 italic">hidden</span>
          ) : (
            <span className="text-xs font-mono text-zinc-300">{pact.amount}</span>
          )}
          <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
            {pact.address}
          </span>
        </div>
      </div>
    </Link>
  )
}
