'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import ConnectButton from './ConnectButton'
import { CIRCLE_FAUCET_URL } from '../lib/arc'

export default function Navbar() {
  const pathname = usePathname()
  const navItems = [
    { href: '/', label: 'Overview' },
    { href: '/me', label: 'Portfolio' },
  ]

  return (
    <nav aria-label="Primary navigation" className="sticky top-0 z-40 border-b border-outline-hairline bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-15 w-full max-w-terminal items-center justify-between gap-2 px-3 @md:h-16 @md:px-6">
      <div className="flex items-center gap-8">
        <Link href="/" className="font-display-mono text-[17px] @md:text-display-mono text-primary-fixed tracking-tighter flex shrink-0 items-center gap-2">
          <Image
            src="/icon.png"
            alt="PACT Logo"
            width={24}
            height={24}
            className="rounded-DEFAULT border border-primary-fixed/30"
          />
          PACT
        </Link>
        <div className="hidden @md:flex items-center gap-1">
          {navItems.map(item => {
            const active = pathname === item.href
            return <Link key={item.href} href={item.href} className={`px-3 py-2 text-[12px] font-medium transition-colors ${active ? 'text-on-surface' : 'text-text-muted hover:text-on-surface'}`}>{item.label}</Link>
          })}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 @md:gap-3">
        <a
          href={CIRCLE_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get test USDC from Circle Faucet (opens in a new tab)"
          className="pact-button-secondary min-h-10 shrink-0 gap-1.5 px-2.5 text-primary-fixed @sm:px-3"
        >
          <span className="material-symbols-outlined text-[17px]" aria-hidden="true">water_drop</span>
          <span className="hidden @sm:inline">Get test USDC</span>
        </a>
        <ConnectButton />
        <Link href="/new" className="pact-button-primary hidden px-4 @md:inline-flex">New pact</Link>
      </div>
      </div>
    </nav>
  )
}
