'use client'

import Link from 'next/link'
import Image from 'next/image'
import ConnectButton from './ConnectButton'
import { arcTestnet } from '../lib/arc'
import { useBlockNumber } from 'wagmi'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()
  const { data: blockNumber, isError: blockError } = useBlockNumber({ watch: true, chainId: arcTestnet.id })

  return (
    <nav className="flex justify-between items-center h-16 px-gutter w-full max-w-terminal mx-auto bg-background text-primary-fixed docked full-width top-0 border-b border-outline-hairline sticky z-40">
      <div className="flex items-center gap-md">
        {/* Brand Logo */}
        <Link href="/" className="font-display-mono text-display-mono text-primary-fixed tracking-tighter flex items-center gap-2">
          <Image
            src="/icon.png"
            alt="PACT Logo"
            width={24}
            height={24}
            className="rounded-DEFAULT border border-primary-fixed/30"
          />
          PACT
        </Link>
        {/* Navigation Links (Desktop) */}
        <div className="hidden md:flex gap-lg ml-xl border-l border-outline-hairline pl-xl h-8 items-center">
          <Link 
            href="/" 
            className={`font-label-caps text-label-caps hover:text-primary-fixed transition-colors duration-150 uppercase ${pathname === '/' ? 'text-primary-fixed border-b-2 border-primary-fixed pb-1 opacity-80' : 'text-text-muted'}`}
          >
            TAPE
          </Link>
          <Link 
            href="/new" 
            className={`font-label-caps text-label-caps hover:text-primary-fixed transition-colors duration-150 uppercase ${pathname === '/new' ? 'text-primary-fixed border-b-2 border-primary-fixed pb-1 opacity-80' : 'text-text-muted'}`}
          >
            NEW
          </Link>
          <Link 
            href="/me" 
            className={`font-label-caps text-label-caps hover:text-primary-fixed transition-colors duration-150 uppercase ${pathname === '/me' ? 'text-primary-fixed border-b-2 border-primary-fixed pb-1 opacity-80' : 'text-text-muted'}`}
          >
            ME
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-md">
        {/* Network Chip / Trust Strip */}
        <div className="hidden sm:flex items-center gap-2 px-2 py-1 border border-outline-hairline bg-surface-lowest text-text-muted font-code-hash text-code-hash rounded-DEFAULT">
          <div className={`w-1.5 h-1.5 rounded-full ${blockError ? 'bg-status-error pulse-live' : 'bg-status-cleared radar-pulse'}`}></div>
          <span className="uppercase">{arcTestnet.name} {blockNumber?.toString() || ''}</span>
        </div>
        
        {/* Mobile View Button - visual only to match HTML */}
        <button className="hidden lg:flex items-center gap-2 px-3 py-2 border border-primary-fixed text-primary-fixed font-label-caps text-label-caps uppercase rounded-DEFAULT hover:bg-primary-fixed/10 transition-colors duration-200">
          <span className="material-symbols-outlined text-[18px]">smartphone</span>
          <span>MOBILE VIEW</span>
        </button>

        <ConnectButton />
        
        <button className="text-primary-fixed hover:text-primary-fixed transition-colors duration-150">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>sensors</span>
        </button>
      </div>
    </nav>
  )
}
