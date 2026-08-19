'use client'

import Link from 'next/link'
import Image from 'next/image'
import ConnectButton from './ConnectButton'

export default function Navbar() {
  return (
    <header className="flex items-center justify-between py-4 mb-8 border-b border-zinc-800 animate-enter font-mono">
      <Link href="/" className="flex items-center gap-3 group cursor-pointer transition-transform active:scale-95 duration-150">
        <div className="relative w-8 h-8 rounded-none overflow-hidden flex items-center justify-center border border-zinc-800 bg-black">
          <Image
            src="/logo.png"
            alt="PACT Logo"
            width={32}
            height={32}
            className="w-full h-full object-cover sepia-[100%] hue-rotate-[50deg] saturate-[300%]"
            priority
          />
        </div>
        <span className="text-[16px] font-bold text-white uppercase tracking-widest group-hover:text-[#c8f542] transition-colors">
          PACT
        </span>
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/me"
          className="hidden @md:inline text-[13px] uppercase tracking-widest text-zinc-500 hover:text-[#c8f542] transition-colors"
        >
          My_Pacts
        </Link>
        <Link
          href="/deploy"
          className="hidden @md:inline text-[13px] uppercase tracking-widest text-zinc-500 hover:text-[#c8f542] transition-colors"
        >
          Deploy
        </Link>
        <a
          href="https://faucet.circle.com/"
          target="_blank"
          rel="noreferrer"
          className="hidden @md:inline text-[13px] uppercase tracking-widest text-zinc-500 hover:text-[#c8f542] transition-colors"
        >
          Faucet_↗
        </a>
        <ConnectButton />
        <a
          href="/new"
          className="btn-primary px-4 py-[7px] text-[12px] uppercase tracking-widest"
        >
          init_pact
        </a>
      </div>
    </header>
  )
}
