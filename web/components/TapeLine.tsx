'use client'

import Link from 'next/link'
import { kindLabel, statusLabel } from '../lib/format'

export default function TapeLine({ pact }: { pact: any }) {
  const isLive = pact.status === 'LIVE' || pact.status === 'PROOF IN'
  const isGood = pact.status === 'CLEARED'
  const isBad = pact.status === 'SLASHED'

  return (
    <Link href={`/p/${pact.id.toString()}`} className="group block">
      <div className="flex items-center justify-between py-3.5 px-1 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors -mx-1 rounded-md">
        {/* Left */}
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-zinc-500 tabular-nums w-10">
            {pact.id.toString().padStart(4, '0')}
          </span>
          <span className="text-[13px] text-zinc-500 hidden sm:inline w-16">
            {pact.kind}
          </span>
          <span className={`text-[12px] font-medium ${
            isLive ? 'text-amber-400' : isGood ? 'text-emerald-400' : isBad ? 'text-rose-400' : 'text-zinc-500'
          }`}>
            {isLive && <span className="inline-block w-[5px] h-[5px] rounded-full bg-amber-400 mr-1.5 animate-pulse-soft align-middle" />}
            {pact.status}
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-5">
          {pact.blurSize ? (
            <span className="text-[13px] text-zinc-600 italic">hidden</span>
          ) : (
            <span className="text-[13px] text-zinc-300 tabular-nums">{pact.amount}</span>
          )}
          <span className="text-[12px] text-zinc-600 font-mono hidden sm:inline">{pact.address}</span>
          <span className="text-zinc-700 group-hover:text-zinc-500 transition-colors">→</span>
        </div>
      </div>
    </Link>
  )
}
