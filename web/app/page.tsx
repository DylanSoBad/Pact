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

  useEffect(() => { document.title = 'PACT · Escrows' }, [])

  async function loadData() {
    if (document.hidden) return
    try {
      const data = await fetchPacts()
      setPacts(data.sort((a, b) => Number(b.id) - Number(a.id)))
      setRpcError(false)
      setLastFetchTime(Date.now())
    } catch { setRpcError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let ok = true; loadData()
    const iv = setInterval(() => { if (ok && !document.hidden) loadData() }, 10000)
    const vis = () => { if (!document.hidden) loadData() }
    document.addEventListener('visibilitychange', vis)
    return () => { ok = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const filtered = useMemo(() =>
    pacts.filter(p => {
      if (filter === 'ALL') return true
      if (filter === 'LIVE') return p.status === 2
      if (filter === 'DELIVERY') return p.kind === 0
      if (filter === 'FX') return p.kind === 1
      if (filter === 'JOB') return p.kind === 2
      return true
    }), [pacts, filter])

  const total = pacts.length
  const live = pacts.filter(p => p.status === 2).length
  const cleared = pacts.filter(p => p.status === 4).length

  const filters = [
    { id: 'ALL', label: 'All' },
    { id: 'DELIVERY', label: 'Delivery' },
    { id: 'FX', label: 'FX' },
    { id: 'JOB', label: 'Job' },
    { id: 'LIVE', label: 'Live' },
  ]

  return (
    <main className="min-h-screen max-w-[780px] mx-auto px-5 sm:px-8 pb-24 overflow-x-hidden">
      <Navbar />
      <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={loadData} />

      {/* Hero */}
      <div className="mb-10 animate-enter">
        <h1 className="text-[22px] sm:text-[26px] font-semibold text-white tracking-[-0.02em] mb-2">
          Escrow contracts
        </h1>
        <p className="text-[15px] text-zinc-500 leading-relaxed max-w-md">
          Lock funds into bilateral agreements with verifiable terms and automatic settlement.
        </p>
      </div>

      {/* Stats — inline */}
      <div className="flex items-center gap-6 mb-8 text-[14px] animate-enter-delay">
        <div>
          <span className="text-zinc-500">Total</span>
          <span className="ml-2 text-white font-semibold tabular-nums">{loading ? '–' : total}</span>
        </div>
        <span className="text-zinc-800">·</span>
        <div>
          <span className="text-zinc-500">Active</span>
          <span className="ml-2 text-amber-400 font-semibold tabular-nums">{loading ? '–' : live}</span>
        </div>
        <span className="text-zinc-800">·</span>
        <div>
          <span className="text-zinc-500">Settled</span>
          <span className="ml-2 text-emerald-400 font-semibold tabular-nums">{loading ? '–' : cleared}</span>
        </div>
      </div>

      {/* Filters with pill click micro-animations */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 animate-enter-delay">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`pill-interactive px-3.5 py-1.5 text-[13px] rounded-lg transition-all ${
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-[14px] text-zinc-600 gap-3">
          <div className="w-4 h-4 border-[1.5px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Loading contracts…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-enter">
          <p className="text-[15px] text-zinc-400 mb-1">No contracts yet</p>
          <p className="text-[13px] text-zinc-600 mb-6">
            {filter === 'ALL' ? 'Create the first escrow pact to get started.' : `No pacts match this filter.`}
          </p>
          <Link
            href="/new"
            className="btn-primary px-5 py-2.5 text-[13px]"
          >
            Create pact
          </Link>
        </div>
      ) : (
        <div className="animate-enter-delay space-y-1">
          {filtered.map(p => {
            const amt = p.kind === 1
              ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
              : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`
            return (
              <TapeLine key={p.id} pact={{
                id: p.id, time: formatTimestamp(p.updatedAt), kind: kindLabel(p.kind),
                status: p.status === 2 ? 'LIVE' : statusLabel(p.status),
                amount: amt, address: truncateAddress(p.maker), blurSize: p.blurSize,
              }} />
            )
          })}
        </div>
      )}
    </main>
  )
}
