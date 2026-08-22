'use client'

import Link from 'next/link'
import Image from 'next/image'
import ConnectButton from './ConnectButton'

export default function Navbar() {
  return (
    <nav aria-label="Primary navigation" className="flex justify-between items-center h-14 @md:h-16 px-4 @md:px-gutter w-full max-w-terminal mx-auto bg-background text-primary-fixed docked full-width top-0 border-b border-outline-hairline sticky z-40">
      <div className="flex items-center gap-3">
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
      </div>

      <div className="flex items-center gap-3">
        <ConnectButton />
        <button aria-label="Network status: live" className="text-primary-fixed hover:text-primary-fixed transition-colors duration-150 p-1" title="Network Live">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0" }}>sensors</span>
        </button>
      </div>
    </nav>
  )
}
