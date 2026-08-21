import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export type ViewMode = 'desktop' | 'mobile'

interface UIState {
  viewMode: ViewMode
  sidebarOpen: boolean
  setViewMode: (mode: ViewMode) => void
  toggleViewMode: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
        viewMode: 'desktop',
        sidebarOpen: false,
        setViewMode: (mode) => set({ viewMode: mode }),
        toggleViewMode: () => {
          const current = get().viewMode
          set({ viewMode: current === 'desktop' ? 'mobile' : 'desktop' })
        },
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      }),
      {
        name: 'pact-ui-storage',
      }
    ),
    { name: 'UIStore' }
  )
)
