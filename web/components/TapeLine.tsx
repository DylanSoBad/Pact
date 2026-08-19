'use client'

import Link from 'next/link'

export default function TapeLine({ pact }: { pact: any }) {
  const isLive = pact.status === 'LIVE' || pact.status === 'ACTIVE'
  const isProofIn = pact.status === 'PROOF IN'
  const isGood = pact.status === 'CLEARED'
  const isBad = pact.status === 'SLASHED'
  const isDisputed = pact.status === 'DISPUTED'
  const isOpen = pact.status === 'OPEN'

  // Distinct badge styling for each status
  const statusBadge = isLive
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    : isProofIn
    ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
    : isGood
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    : isBad
    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
    : isDisputed
    ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
    : 'bg-sky-500/10 text-sky-300 border-sky-500/30'

  // Archetype pill color
  const kindBadge = pact.kind === 'DELIVERY'
    ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
    : pact.kind === 'FX'
    ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/20'

  return (
    <Link href={`/p/${pact.id.toString()}`} className="group block mb-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.15] rounded-xl transition-all duration-200 shadow-sm hover:shadow-md gap-3">
        {/* Left: ID, Archetype, Status */}
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-zinc-400 font-mono font-semibold tabular-nums">
            #{pact.id.toString().padStart(4, '0')}
          </span>

          <span className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${kindBadge}`}>
            {pact.kind}
          </span>

          <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${statusBadge}`}>
            {(isLive || isOpen) && (
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-amber-400 animate-pulse' : 'bg-sky-400'}`} />
            )}
            {pact.status}
          </span>
        </div>

        {/* Right: Locked Amount, Maker Address, Arrow */}
        <div className="flex items-center justify-between sm:justify-end gap-5">
          <div className="text-left sm:text-right">
            <div className="text-[14px] font-semibold text-white tracking-tight tabular-nums font-mono">
              {pact.amount}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Maker: <span className="text-zinc-400">{pact.address}</span>
            </div>
          </div>

          <div className="w-8 h-8 rounded-lg bg-white/[0.03] group-hover:bg-white/[0.1] border border-white/[0.05] flex items-center justify-center text-zinc-400 group-hover:text-white transition-all group-hover:translate-x-0.5 shrink-0">
            →
          </div>
        </div>
      </div>
    </Link>
  )
}
