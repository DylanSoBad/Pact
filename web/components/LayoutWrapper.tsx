'use client'
import { useState, useEffect } from 'react'
import { Monitor, Smartphone } from 'lucide-react'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('preferred-view') as 'desktop' | 'mobile'
    if (saved === 'mobile') setView('mobile')
  }, [])

  const toggleView = () => {
    const next = view === 'desktop' ? 'mobile' : 'desktop'
    setView(next)
    localStorage.setItem('preferred-view', next)
  }

  // Before hydration, render desktop as default to avoid layout shift for standard users
  if (!mounted) {
    return <div className="@container w-full">{children}</div>
  }

  return (
    <>
      <button 
        onClick={toggleView}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#121316] border border-zinc-800 p-3 rounded-full text-zinc-400 hover:text-[#c8f542] hover:border-[#c8f542] transition-colors shadow-2xl"
        title="Toggle Mobile/Desktop View"
      >
        {view === 'desktop' ? <Smartphone size={20} /> : <Monitor size={20} />}
      </button>

      <div className={`transition-all duration-500 ease-in-out mx-auto ${
        view === 'mobile' 
          ? 'max-w-[400px] my-4 md:my-12 border border-zinc-800 rounded-[40px] overflow-hidden shadow-2xl relative bg-[#07080a] min-h-[800px]' 
          : 'w-full'
      }`}>
        <div className="@container h-full relative">
          {children}
        </div>
      </div>
    </>
  )
}
