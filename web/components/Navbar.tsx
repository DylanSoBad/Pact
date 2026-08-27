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
    <header className="sticky top-0 z-40 w-full border-b border-outline-hairline bg-[#07080a]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-terminal items-center justify-between gap-3 px-3 sm:px-4 md:h-16 md:px-6">
        {/* Left: Brand & Nav Links */}
        <div className="flex items-center gap-6 md:gap-8">
          <Link 
            href="/" 
            className="flex items-center gap-2.5 font-display-mono text-base font-bold tracking-tight text-white transition-opacity hover:opacity-90"
            aria-label="PACT Protocol Homepage"
          >
            <Image
              src="/logo.png"
              alt="PACT Logo"
              width={36}
              height={36}
              priority
              className="h-8 w-8 object-contain md:h-9 md:w-9"
            />
            <span className="font-display-mono text-[16px] font-bold tracking-wider text-primary-fixed md:text-[18px]">
              PACT
            </span>
          </Link>

          <nav aria-label="Main Navigation" className="hidden sm:flex items-center gap-1">
            {navItems.map(item => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors ${
                    active
                      ? 'border-b-2 border-primary-fixed font-bold text-white'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right: Actions & Wallet */}
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={CIRCLE_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Get testnet USDC from Circle Faucet (opens in new tab)"
            className="inline-flex min-h-[38px] sm:min-h-[42px] items-center gap-1.5 border border-outline-border bg-[#0c0f12] px-2.5 sm:px-3 font-label-caps text-[11px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary-fixed hover:text-primary-fixed"
          >
            <span className="material-symbols-outlined text-[16px] text-primary-fixed" aria-hidden="true">water_drop</span>
            <span className="hidden sm:inline">Get test USDC</span>
          </a>

          <ConnectButton />

          <Link
            href="/new"
            className="pact-button-primary hidden sm:inline-flex min-h-[38px] sm:min-h-[42px] px-4 font-label-caps text-[11px] font-bold uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
            New pact
          </Link>
        </div>
      </div>
    </header>
  )
}
