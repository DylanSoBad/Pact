'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 pb-safe bg-surface-container-lowest border-t border-outline-hairline">
      <Link 
        href="/"
        className={`flex flex-col items-center justify-center active:bg-surface-container-high transition-transform active:scale-95 w-full h-full ${
          pathname === '/' ? 'text-primary-fixed' : 'text-text-dim'
        }`}
      >
        <span className="material-symbols-outlined mb-1">receipt_long</span>
        <span className="font-label-caps text-label-caps uppercase">Tape</span>
      </Link>
      <Link 
        href="/new"
        className={`flex flex-col items-center justify-center active:bg-surface-container-high transition-transform active:scale-95 w-full h-full ${
          pathname === '/new' ? 'text-primary-fixed' : 'text-text-dim'
        }`}
      >
        <span className="material-symbols-outlined mb-1">add_box</span>
        <span className="font-label-caps text-label-caps uppercase">New</span>
      </Link>
      <Link 
        href="/me"
        className={`flex flex-col items-center justify-center active:bg-surface-container-high transition-transform active:scale-95 w-full h-full ${
          pathname === '/me' ? 'text-primary-fixed' : 'text-text-dim'
        }`}
      >
        <span className="material-symbols-outlined mb-1">person</span>
        <span className="font-label-caps text-label-caps uppercase">Me</span>
      </Link>
    </nav>
  )
}
