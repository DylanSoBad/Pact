'use client'

import { useEffect, useState } from 'react'
import { useUIStore } from '../lib/store/useUIStore'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { viewMode, setViewMode } = useUIStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const activeView = mounted ? viewMode : 'desktop'

  return (
    <>
      <div className="fixed bottom-20 right-3 z-[70] flex items-center border border-outline-border bg-[#0c0f12] p-1 md:bottom-5 md:right-5" role="group" aria-label="Preview layout">
        {(['desktop', 'mobile'] as const).map(mode => {
          const active = activeView === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={active}
              className={`flex min-h-10 items-center gap-1.5 px-2.5 font-label-caps text-[10px] uppercase tracking-wider transition-colors sm:px-3 ${active ? 'bg-primary-fixed text-on-primary-fixed' : 'text-text-muted hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{mode === 'desktop' ? 'desktop_windows' : 'smartphone'}</span>
              <span className="hidden sm:inline">{mode === 'desktop' ? 'Desktop' : 'Phone'}</span>
            </button>
          )
        })}
      </div>

      <div className={`@container mx-auto flex w-full flex-col bg-background text-on-background transition-[max-width,border-color] duration-300 ${
        activeView === 'mobile'
          ? 'my-4 h-[calc(100dvh-2rem)] max-w-[420px] overflow-hidden border border-outline-border'
          : 'h-dvh overflow-hidden'
      }`}>
        {children}
      </div>
    </>
  )
}
