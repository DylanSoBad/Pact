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

  const total = pacts.length
  const live = pacts.filter(p => p.status === 2 || p.status === 3).length
  const cleared = pacts.filter(p => p.status === 4).length
  const settledVol = (
    pacts.filter(p => p.status === 4).reduce((sum, p) => sum + Number(p.amountMaker) / 1e6, 0)
  ).toFixed(2)

  const filters = [
    { id: 'ALL', label: 'All' },
    ...(address ? [{ id: 'MY', label: 'My Pacts' }] : []),
    { id: 'DELIVERY', label: 'Delivery' },
    { id: 'FX', label: 'FX' },
    { id: 'JOB', label: 'Job' },
    { id: 'LIVE', label: 'Live' },
  ]

  return (
    <main className="min-h-screen max-w-[780px] mx-auto px-5 sm:px-8 pb-24 overflow-x-hidden">
      <Navbar />
      <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={loadData} />

      {/* Hero with Direct Arc RPC Latency Indicator */}
      <div className="mb-6 animate-enter">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="text-[22px] sm:text-[26px] font-semibold text-white tracking-[-0.02em]">
            Escrow contracts
          </h1>
          {latencyMs !== null && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
              Multicall3 RPC: {latencyMs}ms
            </span>
          )}
        </div>
        <p className="text-[15px] text-zinc-400 leading-relaxed max-w-md">
          Lock funds into bilateral agreements with verifiable terms and automatic settlement on Circle Arc.
        </p>
      </div>

      {/* Highlighted Metrics Dashboard Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 animate-enter-delay">
        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-sky-500/20 hover:border-sky-500/40 transition-colors">
          <div className="text-[12px] text-sky-300 font-medium">Total Escrows</div>
          <div className="text-[20px] font-bold text-sky-400 mt-1 tabular-nums">
            {loading ? '–' : total}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-amber-500/20 hover:border-amber-500/40 transition-colors">
          <div className="text-[12px] text-amber-300 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Active
          </div>
          <div className="text-[20px] font-bold text-amber-400 mt-1 tabular-nums">
            {loading ? '–' : live}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
          <div className="text-[12px] text-emerald-300 font-medium">Settled</div>
          <div className="text-[20px] font-bold text-emerald-400 mt-1 tabular-nums">
            {loading ? '–' : cleared}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
          <div className="text-[12px] text-emerald-300 font-medium">Settled Volume</div>
          <div className="text-[20px] font-bold text-emerald-300 mt-1 tabular-nums font-mono">
            ${loading ? '–' : settledVol}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 animate-enter-delay">
        {/* Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`pill-interactive px-3.5 py-1.5 text-[13px] rounded-lg transition-all shrink-0 ${
                filter === f.id
                  ? 'bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              {f.id === 'LIVE' && filter !== 'LIVE' && (
                <span className="inline-block w-[5px] h-[5px] rounded-full bg-amber-400 mr-1.5 align-middle animate-pulse-soft" />
              )}
              {f.label}
            </button>
          ))}
        </div>

        {/* Instant Search Box with direct Enter jump */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search #id or 0x address (↵ to open)…"
            className="w-full sm:w-64 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] text-white px-3 py-1.5 rounded-lg text-[12px] placeholder:text-zinc-600 focus:border-emerald-500/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1.5 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-[14px] text-zinc-600 gap-3">
          <div className="w-4 h-4 border-[1.5px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Reading on-chain state via Multicall3…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-enter">
          <p className="text-[15px] text-zinc-400 mb-1">
            {searchQuery ? `No contracts found matching "${searchQuery}"` : 'No contracts yet'}
          </p>
          <p className="text-[13px] text-zinc-600 mb-6">
            {searchQuery
              ? 'Try searching with another address or pact ID.'
              : filter === 'ALL'
              ? 'Create the first escrow pact to get started.'
              : `No pacts match this filter.`}
          </p>
          <Link
            href="/new"
            className="btn-primary px-5 py-2.5 text-[13px]"
          >
            Create pact
          </Link>
        </div>
      ) : (
        <div className="animate-enter-delay space-y-2">
          {filtered.map(p => {
            const amt = p.kind === 1
              ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
              : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`
            return (
              <TapeLine key={p.id} pact={{
                id: p.id,
                time: formatTimestamp(p.updatedAt),
                kind: kindLabel(p.kind),
                status: p.status === 2 ? 'ACTIVE' : p.status === 3 ? 'PROOF IN' : p.status === 8 ? 'DISPUTED' : statusLabel(p.status),
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
