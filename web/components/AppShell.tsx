'use client'

import { useEffect, useState } from 'react'
import { useUIStore } from '../lib/store/useUIStore'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { viewMode } = useUIStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isMobileSim = mounted && viewMode === 'mobile'

  return (
    <div
      className={`mx-auto flex w-full min-h-screen flex-col bg-background text-on-background transition-[max-width,border-color] duration-200 ${
        isMobileSim
          ? 'my-4 max-w-[430px] rounded border border-outline-border shadow-2xl overflow-hidden'
          : 'max-w-full'
      }`}
    >
      {children}
    </div>
  )
}
