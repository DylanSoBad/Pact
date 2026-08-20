'use client'

import { useState, useEffect, createContext, useContext } from 'react'

type ViewMode = 'desktop' | 'mobile'

interface ViewContextType {
  view: ViewMode
  toggleView: () => void
}

export const ViewContext = createContext<ViewContextType>({
  view: 'desktop',
  toggleView: () => {}
})

export function useViewMode() {
  return useContext(ViewContext)
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<ViewMode>('desktop')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('preferred-view') as ViewMode
    if (saved === 'mobile') setView('mobile')
  }, [])

  const toggleView = () => {
    const next = view === 'desktop' ? 'mobile' : 'desktop'
    setView(next)
    localStorage.setItem('preferred-view', next)
  }

  if (!mounted) {
    return (
      <ViewContext.Provider value={{ view: 'desktop', toggleView }}>
        <div className="@container w-full min-h-screen flex flex-col">
          {children}
        </div>
      </ViewContext.Provider>
    )
  }

  return (
    <ViewContext.Provider value={{ view, toggleView }}>
      <div className={`transition-all duration-500 ease-in-out mx-auto flex flex-col @container ${
        view === 'mobile' 
          ? 'max-w-[400px] w-full my-4 md:my-12 border border-outline-hairline rounded-[40px] shadow-2xl relative bg-background min-h-[850px] max-h-[850px] overflow-hidden transform-gpu' 
          : 'w-full min-h-screen'
      }`}>
        <div className="flex-1 w-full relative flex flex-col overflow-y-auto hide-scroll">
          {children}
        </div>
      </div>
    </ViewContext.Provider>
  )
}
