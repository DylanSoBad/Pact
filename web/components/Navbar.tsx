'use client'

import Link from 'next/link'
import ConnectButton from './ConnectButton'

export default function Navbar() {
  return (
    <header className="flex items-center justify-between py-4 mb-8 animate-enter">
      <Link href="/" className="flex items-center gap-2.5 group cursor-pointer transition-transform active:scale-95 duration-150">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-black font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.2)] group-hover:scale-105 transition-transform duration-200">
          P
        </div>
        <span className="text-[15px] font-semibold text-white tracking-[-0.01em] group-hover:text-zinc-200 transition-colors">
          PACT
        </span>
      </Link>

      <div className="flex items-center gap-3">
        <a
          href="https://faucet.circle.com/"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline text-[13px] text-zinc-500 hover:text-zinc-200 transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-95 duration-150"
        >
          Faucet ↗
        </a>
        <ConnectButton />
        <Link
          href="/new"
          className="btn-primary px-4 py-[7px] text-[13px]"
        >
          New pact
        </Link>
      </div>
    </header>
  )
}
