'use client'

import Link from 'next/link'
import Image from 'next/image'
import ConnectButton from './ConnectButton'
import { arcTestnet } from '../lib/arc'
import { useBlockNumber } from 'wagmi'
import { usePathname } from 'next/navigation'
import { useViewMode } from './AppShell'

export default function Navbar() {
  const pathname = usePathname()
  const { data: blockNumber, isError: blockError } = useBlockNumber({ watch: true, chainId: arcTestnet.id })
  const { view, toggleView } = useViewMode()

  return (
    <nav className="flex justify-between items-center h-14 @md:h-16 px-4 @md:px-gutter w-full max-w-terminal mx-auto bg-background text-primary-fixed docked full-width top-0 border-b border-outline-hairline sticky z-40">
      <div className="flex items-center gap-3 @md:gap-md">
        {/* Brand Logo */}
        <Link href="/" className="font-display-mono text-[18px] @md:text-display-mono text-primary-fixed tracking-tighter flex items-center gap-2">
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
        <div className="hidden @md:flex gap-lg ml-xl border-l border-outline-hairline pl-xl h-8 items-center">
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
      <div className="flex items-center gap-2 @md:gap-md">
        {/* Network Chip / Trust Strip - only shown when there is enough horizontal room */}
        <div className="hidden @md:flex items-center gap-2 px-2 py-1 border border-outline-hairline bg-surface-lowest text-text-muted font-code-hash text-code-hash rounded-DEFAULT">
          <div className={`w-1.5 h-1.5 rounded-full ${blockError ? 'bg-status-error pulse-live' : 'bg-status-cleared radar-pulse'}`}></div>
          <span className="uppercase">{arcTestnet.name} {blockNumber?.toString() || ''}</span>
        </div>
        
        {/* Mobile View Toggle Button (in Navbar for large screens) */}
        <button 
          onClick={toggleView}
          className="hidden @lg:flex items-center gap-2 px-3 py-1.5 border border-primary-fixed text-primary-fixed font-label-caps text-label-caps uppercase rounded-DEFAULT hover:bg-primary-fixed/10 transition-colors duration-200"
          title="Toggle view"
        >
          <span className="material-symbols-outlined text-[18px]">
            {view === 'desktop' ? 'smartphone' : 'desktop_windows'}
          </span>
          <span>{view === 'desktop' ? 'MOBILE VIEW' : 'DESKTOP'}</span>
        </button>

        <ConnectButton />
        
        <button className="hidden @sm:flex text-primary-fixed hover:text-primary-fixed transition-colors duration-150">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0" }}>sensors</span>
        </button>
      </div>
    </nav>
  )
}
