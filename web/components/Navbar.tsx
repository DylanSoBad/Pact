'use client'

import Link from 'next/link'
import ConnectButton from './ConnectButton'

export default function Navbar() {
  return (
    <header className="flex items-center justify-between pb-5 mb-5 border-b border-[#1e2028]">
      {/* Left: Logo + Name */}
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center font-mono font-bold text-xs text-black shadow-sm">
          P
        </div>
        <span className="text-sm font-semibold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
          PACT
        </span>
      </Link>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <a
          href="https://faucet.circle.com/"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 rounded-md hover:bg-zinc-800/60 transition-all"
        >
          Faucet ↗
        </a>

        <ConnectButton />

        <Link
          href="/new"
          className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black px-3.5 py-1.5 text-xs font-mono font-bold rounded-md transition-colors"
        >
          + New
        </Link>
      </div>
    </header>
  )
}
