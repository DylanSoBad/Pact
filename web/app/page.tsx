'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '../components/Navbar'
import TrustStrip from '../components/TrustStrip'
import TapeLine from '../components/TapeLine'
import { fetchPacts, PactData } from '../lib/reads'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../lib/format'

export default function Home() {
  const [filter, setFilter] = useState('ALL')
  const [pacts, setPacts] = useState<PactData[]>([])
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now())

  useEffect(() => {
    document.title = 'PACT · Escrows'
  }, [])

  async function loadData() {
    if (document.hidden) return
    try {
      const data = await fetchPacts()
      setPacts(data.sort((a, b) => Number(b.id) - Number(a.id)))
      setRpcError(false)
      setLastFetchTime(Date.now())
    } catch {
      setRpcError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    loadData()

    const interval = setInterval(() => {
      if (mounted && !document.hidden) loadData()
    }, 10000)

    const onVis = () => { if (!document.hidden) loadData() }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      mounted = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const filtered = useMemo(() => {
    return pacts.filter(p => {
      if (filter === 'ALL') return true
      if (filter === 'LIVE') return p.status === 2
      if (filter === 'DELIVERY') return p.kind === 0
      if (filter === 'FX') return p.kind === 1
      if (filter === 'JOB') return p.kind === 2
      return true
    })
  }, [pacts, filter])

  const stats = useMemo(() => ({
    total: pacts.length,
    live: pacts.filter(p => p.status === 2).length,
    cleared: pacts.filter(p => p.status === 4).length,
  }), [pacts])

  return (
    <main className="min-h-screen max-w-[820px] mx-auto pt-6 sm:pt-8 px-4 sm:px-6 pb-20 overflow-x-hidden">
      <Navbar />
      <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={loadData} />

      {/* Hero text */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 tracking-tight mb-1">
          Escrow Dashboard
        </h1>
        <p className="text-sm text-zinc-500 max-w-lg">
          Lock crypto into trustless bilateral contracts with verifiable terms, collateral bonds, and automatic settlement.
        </p>
      </div>

      {/* Stats bar — 1 col mobile, 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total" value={loading ? '—' : stats.total} />
        <StatCard label="Active" value={loading ? '—' : stats.live} accent="amber" />
        <StatCard label="Cleared" value={loading ? '—' : stats.cleared} accent="emerald" />
      </div>

      {/* Filter row — horizontal scroll, no wrap */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
        {[
          { id: 'ALL', label: 'All' },
          { id: 'DELIVERY', label: 'Delivery' },
          { id: 'FX', label: 'FX Swap' },
          { id: 'JOB', label: 'Job' },
          { id: 'LIVE', label: 'Live' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filter === tab.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
            }`}
          >
            {tab.id === 'LIVE' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ledger */}
      <div className="rounded-lg border border-zinc-800/60 overflow-hidden bg-zinc-900/30">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500 font-mono text-xs gap-2">
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Reading on-chain ledger…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 mb-3 font-mono text-sm">
              Ø
            </div>
            <p className="text-sm text-zinc-300 mb-1">No pacts found</p>
            <p className="text-xs text-zinc-500 mb-5 max-w-xs">
              {filter === 'ALL'
                ? 'No contracts deployed yet. Create the first one.'
                : `No pacts match the "${filter}" filter.`}
            </p>
            <Link
              href="/new"
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 text-xs font-mono font-bold rounded-md transition-colors"
            >
              + Create Pact
            </Link>
          </div>
        ) : (
          filtered.map(p => {
            const amt = p.kind === 1
              ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
              : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`
            return (
              <TapeLine
                key={p.id}
                pact={{
                  id: p.id,
                  time: formatTimestamp(p.updatedAt),
                  kind: kindLabel(p.kind),
                  status: p.status === 2 ? 'LIVE' : statusLabel(p.status),
                  amount: amt,
                  address: truncateAddress(p.maker),
                  blurSize: p.blurSize,
                }}
              />
            )
          })
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: 'emerald' | 'amber' }) {
  const valueColor = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : 'text-zinc-100'
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-4 py-3">
      <span className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-0.5">{label}</span>
      <span className={`text-lg font-mono font-bold ${valueColor}`}>{value}</span>
    </div>
  )
}
