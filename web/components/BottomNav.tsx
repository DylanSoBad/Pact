'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { href: '/', label: 'Overview', icon: 'receipt_long' },
    { href: '/new', label: 'New Pact', icon: 'add_circle' },
    { href: '/me', label: 'Portfolio', icon: 'person' },
  ]

  return (
    <nav
      aria-label="Mobile Navigation"
      className="mobile-safe-nav sticky bottom-0 z-40 grid w-full shrink-0 grid-cols-3 border-t border-outline-hairline bg-[#07080a]/95 backdrop-blur-md sm:hidden"
    >
      {tabs.map(tab => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[48px] w-full flex-col items-center justify-center py-2 transition-colors active:bg-surface-container ${
              active
                ? 'border-t-2 border-primary-fixed text-primary-fixed'
                : 'border-t-2 border-transparent text-text-dim hover:text-text-muted'
            }`}
          >
            <span className="material-symbols-outlined text-[20px] mb-0.5" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="font-label-caps text-[10px] uppercase tracking-wider font-semibold">
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
