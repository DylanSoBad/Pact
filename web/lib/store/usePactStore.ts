import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { PactData } from '../reads'

export type FilterCategory = 'ALL' | 'DELIVERY' | 'FX' | 'JOB' | 'LIVE'

interface PactStoreState {
  filter: FilterCategory
  pacts: PactData[]
  loading: boolean
  networkError: boolean
  lastBlockNumber: bigint | null
  lastBlockTimestamp: number
  sseConnected: boolean
  setFilter: (filter: FilterCategory) => void
  setPacts: (pacts: PactData[]) => void
  addPact: (pact: PactData) => void
  setLoading: (loading: boolean) => void
  setNetworkError: (error: boolean) => void
  setBlockInfo: (blockNumber: bigint, timestamp?: number) => void
  setSseConnected: (connected: boolean) => void
}

export const usePactStore = create<PactStoreState>()(
  devtools(
    (set) => ({
      filter: 'ALL',
      pacts: [],
      loading: true,
      networkError: false,
      lastBlockNumber: null,
      lastBlockTimestamp: Date.now(),
      sseConnected: false,

      setFilter: (filter) => set({ filter }),
      setPacts: (pacts) => set({ pacts, loading: false, networkError: false }),
      addPact: (pact) =>
        set((state) => {
          const exists = state.pacts.some((p) => p.id === pact.id)
          if (exists) {
            return {
              pacts: state.pacts.map((p) => (p.id === pact.id ? pact : p)),
            }
          }
          return { pacts: [pact, ...state.pacts] }
        }),
      setLoading: (loading) => set({ loading }),
      setNetworkError: (networkError) => set({ networkError }),
      setBlockInfo: (lastBlockNumber, timestamp = Date.now()) =>
        set({ lastBlockNumber, lastBlockTimestamp: timestamp, networkError: false }),
      setSseConnected: (sseConnected) => set({ sseConnected }),
    }),
    { name: 'PactStore' }
  )
)
