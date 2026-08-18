'use client'

import Link from 'next/link'
import ConnectButton from './ConnectButton'
import { arcTestnet } from '../lib/arc'

export default function Navbar() {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-[#1c1d22]">
      {/* Brand & One-Liner */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-7 h-7 rounded-md bg-[#18191d] border border-[#27282e] group-hover:border-emerald-500/50 flex items-center justify-center font-mono font-bold text-xs text-zinc-100 shadow-sm transition-colors">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-zinc-100 group-hover:text-emerald-400 transition-colors">
                PACT PROTOCOL
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                Arc Testnet (5042002)
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">A promise with money locked behind it</p>
          </div>
        </Link>
      </div>

      {/* Nav Tools & Actions */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <a
          href="https://faucet.circle.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium text-zinc-300 hover:text-emerald-400 bg-[#111215] hover:bg-[#18191d] border border-[#222328] hover:border-emerald-500/30 rounded-md transition-all"
          title="Get free Circle testnet USDC"
        >
          <span className="text-emerald-400 font-bold">🚰</span> Get Test USDC ↗
        </a>

        <a
          href="https://testnet.arcscan.app"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium text-zinc-400 hover:text-zinc-200 bg-[#111215] hover:bg-[#18191d] border border-[#222328] rounded-md transition-all"
        >
          ArcScan ↗
        </a>

        <ConnectButton />

        <Link
          href="/new"
          className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1.5 text-xs font-mono font-bold rounded-md transition-all shadow-sm cursor-pointer"
        >
          <span>+</span> NEW PACT
        </Link>
      </div>
    </header>
  )
}
