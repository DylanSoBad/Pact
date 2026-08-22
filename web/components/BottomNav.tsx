'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Mobile navigation" className="mobile-safe-nav @md:hidden z-50 grid w-full shrink-0 grid-cols-3 items-start border-t border-outline-hairline bg-surface-container-lowest">
      <Link 
        href="/"
        className={`flex min-h-16 w-full flex-col items-center justify-center active:bg-surface-container-high transition-transform active:scale-95 ${
          pathname === '/' ? 'text-primary-fixed' : 'text-text-dim'
        }`}
      >
        <span className="material-symbols-outlined mb-1">receipt_long</span>
        <span className="font-label-caps text-label-caps uppercase">Overview</span>
      </Link>
      <Link href="/new" className={`flex min-h-16 w-full flex-col items-center justify-center ${pathname === '/new' ? 'text-primary-fixed' : 'text-text-dim'}`}>
        <span className="material-symbols-outlined mb-1">add_circle</span>
        <span className="font-label-caps text-label-caps uppercase">New</span>
      </Link>
      <Link 
        href="/me"
        className={`flex min-h-16 w-full flex-col items-center justify-center active:bg-surface-container-high transition-transform active:scale-95 ${
          pathname === '/me' ? 'text-primary-fixed' : 'text-text-dim'
        }`}
      >
        <span className="material-symbols-outlined mb-1">person</span>
        <span className="font-label-caps text-label-caps uppercase">Portfolio</span>
      </Link>
    </nav>
  )
}
