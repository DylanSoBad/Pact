'use client'

import Link from 'next/link'

export default function TapeLine({ pact }: { pact: any }) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'LIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            LIVE
          </span>
        );
      case 'CLEARED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            CLEARED
          </span>
        );
      case 'SLASHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            SLASHED
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50">
            EXPIRED
          </span>
        );
      case 'PROOF IN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping" />
            PROOF IN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50">
            {status}
          </span>
        );
    }
  };

  const getKindBadge = (kind: string) => {
    return (
      <span className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider bg-zinc-800/60 px-1.5 py-0.5 rounded border border-zinc-700/40">
        {kind}
      </span>
    );
  };

  return (
    <Link href={`/p/${pact.id.toString()}`} className="group block">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 px-4 border-b border-[#1c1d22] bg-transparent hover:bg-[#121317] transition-all gap-2 sm:gap-4">
        {/* Left Section: ID, Kind, Status, Timestamp */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors w-12">
            #{pact.id.toString().padStart(4, '0')}
          </span>
          {getKindBadge(pact.kind)}
          {getStatusBadge(pact.status)}
          <span className="text-xs font-mono text-zinc-500 hidden md:inline-block">
            {pact.time}
          </span>
        </div>

        {/* Right Section: Amount Locked, Maker Address */}
        <div className="flex items-center justify-between sm:justify-end gap-6">
          <div className="text-right">
            {pact.blurSize ? (
              <span className="text-xs font-mono text-zinc-500 italic bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-800">
                SIZE HIDDEN
              </span>
            ) : (
              <span className="text-xs font-mono font-medium text-zinc-200 tracking-tight">
                {pact.amount}
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-zinc-400 group-hover:text-zinc-300 bg-[#17181c] px-2 py-1 rounded border border-[#23242a]">
              {pact.address}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
