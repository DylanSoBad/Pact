'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SideNav() {
  const pathname = usePathname()
  
  return (
    <aside className="hidden @lg:flex flex-col h-screen fixed left-0 top-0 w-64 bg-surface-container-lowest text-primary-fixed border-r border-outline-hairline z-30 transition-all duration-200 pt-16">
      <div className="p-lg border-b border-outline-hairline">
        <h2 className="font-display-mono text-display-mono text-primary-fixed">PACT PROTOCOL</h2>
        <p className="font-code-hash text-code-hash text-text-muted mt-2 cmd-prompt">ARC TESTNET 5042002</p>
      </div>
      <nav aria-label="Pact navigation" className="flex-1 overflow-y-auto py-md">
        <ul className="flex flex-col gap-1 px-sm">
          <li>
            <Link 
              href="/"
              aria-label="View transaction tape"
              className={`flex items-center gap-md px-md py-sm font-body-mono text-body-mono uppercase transition-all duration-200 ${
                pathname === '/' 
                  ? 'bg-secondary-container text-primary-fixed border-l-2 border-primary-fixed'
                  : 'text-text-dim hover:text-on-surface-variant hover:bg-surface-container-low border-l-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              TAPE
            </Link>
          </li>
          <li className="pt-4 px-md flex items-center gap-2 text-label-caps font-label-caps text-text-muted uppercase"><span aria-hidden="true" className="material-symbols-outlined text-[16px]">folder_open</span>My pacts</li>
          {['Active', 'Completed', 'Disputed'].map((tab) => (
            <li key={tab}>
              <Link href={`/me?status=${tab.toLowerCase()}`} aria-label={`View ${tab.toLowerCase()} pacts`} className="flex items-center gap-md px-md py-sm ml-3 font-body-mono text-body-mono uppercase text-text-dim hover:text-on-surface-variant hover:bg-surface-container-low border-l-2 border-transparent">
                <span className="material-symbols-outlined text-[16px]">{tab === 'Active' ? 'play_circle' : tab === 'Completed' ? 'task_alt' : 'gavel'}</span>
                {tab}
              </Link>
            </li>
          ))}
          <li>
            <Link 
              href="/new"
              aria-label="Create new pact"
              className={`flex items-center gap-md px-md py-sm font-body-mono text-body-mono uppercase transition-all duration-200 ${
                pathname === '/new'
                  ? 'bg-secondary-container text-primary-fixed border-l-2 border-primary-fixed'
                  : 'text-text-dim hover:text-on-surface-variant hover:bg-surface-container-low border-l-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">add_box</span>
              NEW
            </Link>
          </li>
          <li>
            <Link 
              href="/me"
              aria-label="View my profile"
              title="Your profile and pact history"
              className={`flex items-center gap-md px-md py-sm font-body-mono text-body-mono uppercase transition-all duration-200 ${
                pathname === '/me'
                  ? 'bg-secondary-container text-primary-fixed border-l-2 border-primary-fixed'
                  : 'text-text-dim hover:text-on-surface-variant hover:bg-surface-container-low border-l-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person</span>
              ME
            </Link>
          </li>
        </ul>
      </nav>
      <div className="p-lg border-t border-outline-hairline mt-auto">
        <Link 
          href={pathname === '/new' ? '/' : '/new'}
          aria-label={pathname === '/new' ? 'Back to transaction tape' : 'Create new pact'}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-primary-fixed bg-transparent text-primary-fixed font-label-caps text-label-caps uppercase rounded-DEFAULT hover:bg-primary-fixed hover:text-on-primary-fixed transition-colors duration-200"
        >
          {pathname === '/new' ? '← Back to Tape' : 'NEW PACT'}
        </Link>
        {process.env.NEXT_PUBLIC_PACT_ADDRESS && (
          <a href={`https://testnet.arcscan.app/address/${process.env.NEXT_PUBLIC_PACT_ADDRESS}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-[10px] text-text-dim hover:text-primary-fixed" title="View verified protocol contract on ArcScan"><span aria-hidden="true" className="material-symbols-outlined text-[13px]">verified</span> Verified contract ↗</a>
        )}
      </div>
    </aside>
  )
}
