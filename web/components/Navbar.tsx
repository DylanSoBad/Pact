'use client'

import Link from 'next/link'
import Image from 'next/image'
import ConnectButton from './ConnectButton'

export default function Navbar() {
  return (
    <header className="flex items-center justify-between py-4 mb-8 animate-enter">
      <Link href="/" className="flex items-center gap-3 group cursor-pointer transition-transform active:scale-95 duration-150">
        <div className="relative w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform duration-200 shadow-[0_0_20px_rgba(59,130,246,0.2)] border border-white/10 bg-white/[0.03]">
          <Image
            src="/logo.png"
            alt="PACT Logo"
            width={36}
            height={36}
            className="w-full h-full object-cover"
            priority
          />
        </div>
        <span className="text-[16px] font-semibold text-white tracking-[-0.01em] group-hover:text-zinc-200 transition-colors">
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
