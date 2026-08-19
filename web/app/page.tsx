'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '../components/Navbar'
import TrustStrip from '../components/TrustStrip'
import TapeLine from '../components/TapeLine'
import { fetchPacts, PactData } from '../lib/reads'
import { getPactAddress } from '../lib/arc'
import { useAccount } from 'wagmi'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../lib/format'

export default function Home() {
  const router = useRouter()
  const { address } = useAccount()
  const [filter, setFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [pacts, setPacts] = useState<PactData[]>([])
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now())

  useEffect(() => { document.title = 'PACT · Escrows' }, [])

  // Spec §9 Compliant: Direct Multicall3 poll every 2s
  async function loadData() {
    if (document.hidden) return
    const start = performance.now()
    try {
      const contractAddress = getPactAddress()
      const data = await fetchPacts(50, contractAddress)
      setPacts(data)
      setLatencyMs(Math.round(performance.now() - start))
      setRpcError(false)
      setLastFetchTime(Date.now())
    } catch (err) {
      console.error('RPC Multicall poll error:', err)
      setRpcError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ok = true
    loadData()
    // 2-second high frequency real-time Multicall3 polling (Spec §9)
    const iv = setInterval(() => { if (ok && !document.hidden) loadData() }, 2000)
    const vis = () => { if (!document.hidden) loadData() }
    document.addEventListener('visibilitychange', vis)
    return () => { ok = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const clean = searchQuery.trim().replace(/^#/, '')
      if (/^\d+$/.test(clean)) {
        router.push(`/p/${clean}`)
      }
    }
  }

  const filtered = useMemo(() =>
    pacts.filter(p => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim().replace(/^#/, '')
        const matchId = p.id.toString() === q || p.id.toString().includes(q)
        const matchMaker = p.maker.toLowerCase().includes(q)
        const matchTaker = p.taker.toLowerCase().includes(q)
        if (!matchId && !matchMaker && !matchTaker) return false
      }

      // Tab filters
      if (filter === 'ALL') return true
      if (filter === 'MY') {
        if (!address) return true
        return p.maker.toLowerCase() === address.toLowerCase() || p.taker.toLowerCase() === address.toLowerCase()
      }
      if (filter === 'LIVE') return p.status === 2 || p.status === 3
      if (filter === 'DELIVERY') return p.kind === 0
      if (filter === 'FX') return p.kind === 1
      if (filter === 'JOB') return p.kind === 2
      return true
    }), [pacts, filter, searchQuery, address])

  return (
    <main className="min-h-screen max-w-[780px] mx-auto px-5 @md:px-8 pb-24 overflow-x-hidden font-mono">
      <Navbar />
      <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={loadData} />

      {/* Hero with Direct Arc RPC Latency Indicator */}
      <div className="mb-6 animate-enter border-b border-zinc-800 pb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="text-[20px] font-bold text-white tracking-widest uppercase">
            &gt; PACT_FEED
          </h1>
          {latencyMs !== null && (
            <span className="hidden @md:inline-flex items-center gap-1.5 text-[11px] font-mono text-[#c8f542]">
              <span className="w-1.5 h-1.5 bg-[#c8f542] animate-pulse-soft" />
              RPC_LATENCY: {latencyMs}ms
            </span>
          )}
        </div>
        <p className="text-[12px] text-zinc-500 max-w-md">
          Live bilateral settlement stream on Circle Arc Testnet.
        </p>
      </div>

      {/* Terminal Filter Input */}
      <div className="mb-4 animate-enter-delay relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c8f542] text-[13px]">&gt;</span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="filter by id or address..."
          className="w-full bg-[#07080a] border border-zinc-800 focus:border-[#c8f542] text-white pl-8 pr-3 py-2 rounded-none text-[13px] placeholder:text-zinc-700 transition-colors focus:ring-0 outline-none"
        />
      </div>



      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-[14px] text-zinc-600 gap-3">
          <div className="w-3 h-3 bg-[#c8f542] animate-pulse-soft" />
          POLLING_CHAIN_DATA...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-enter">
          <p className="text-[13px] text-zinc-500 mb-1">
            {searchQuery ? `0 matches for "${searchQuery}"` : 'DATA_STREAM_EMPTY'}
          </p>
          <Link
            href="/new"
            className="text-[12px] text-[#c8f542] underline mt-4"
          >
            &gt; init_pact
          </Link>
        </div>
      ) : (
        <div className="animate-enter-delay border-t border-zinc-800">
          {filtered.map(p => {
            const amt = p.kind === 1
              ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
              : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`
            return (
              <TapeLine key={p.id} pact={{
                id: p.id,
                time: formatTimestamp(p.updatedAt),
                kind: kindLabel(p.kind),
                status: p.status === 2 ? 'ACTIVE' : p.status === 3 ? 'PROOF IN' : statusLabel(p.status),
                amount: amt,
                address: truncateAddress(p.maker),
                blurSize: false,
              }} />
            )
          })}
        </div>
      )}
    </main>
  )
}
