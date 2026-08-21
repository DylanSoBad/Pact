'use client'

import { useEffect, useState } from 'react'
import { useUIStore, ViewMode } from '../lib/store/useUIStore'

export function useViewMode() {
  const { viewMode, toggleViewMode } = useUIStore()
  return { view: viewMode, toggleView: toggleViewMode }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { viewMode, toggleViewMode } = useUIStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="@container w-full min-h-screen flex flex-col bg-surface-black text-on-background">
        {children}
      </div>
    )
  }

  return (
    <>
      {/* Floating Toggle Button (Always visible to switch responsive modes) */}
      <button 
        onClick={toggleViewMode}
        aria-label={viewMode === 'desktop' ? 'Switch to mobile viewport simulation' : 'Switch to desktop viewport'}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#121316]/95 backdrop-blur-md border border-outline-hairline hover:border-primary-fixed px-4 py-2.5 rounded-full text-text-muted hover:text-primary-fixed transition-all duration-200 shadow-[0_4px_24px_rgba(0,0,0,0.8)] font-label-caps uppercase text-label-caps hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary-fixed focus-visible:outline-none"
        title="Toggle Desktop / Mobile View"
      >
        <span className="material-symbols-outlined text-[18px]">
          {viewMode === 'desktop' ? 'smartphone' : 'desktop_windows'}
        </span>
        <span className="font-bold tracking-wider">
          {viewMode === 'desktop' ? 'MOBILE VIEW' : 'DESKTOP VIEW'}
        </span>
      </button>

      {/* Main Container */}
      <div className={`transition-all duration-300 ease-in-out mx-auto flex flex-col @container ${
        viewMode === 'mobile' 
          ? 'max-w-[420px] w-full my-4 md:my-8 border border-outline-border rounded-[36px] shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative bg-[#07080a] min-h-[820px] max-h-[92vh] overflow-hidden transform-gpu ring-1 ring-white/5' 
          : 'w-full min-h-screen'
      }`}>
        <div className="flex-1 w-full relative flex flex-col overflow-y-auto hide-scroll">
          {children}
        </div>
      </div>
    </>
  )
}
