'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '../components/Navbar'
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

  useEffect(() => {
    let mounted = true
    async function load() {
      const data = await fetchPacts()
      if (mounted) {
        // Sort descending by ID so newest is at top
        setPacts(data.sort((a, b) => Number(b.id) - Number(a.id)))
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 3000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const filteredPacts = useMemo(() => {
    return pacts.filter(p => {
      if (filter === 'ALL') return true
      if (filter === 'LIVE') return p.status === 2 // Status.LIVE
      if (filter === 'DELIVERY') return p.kind === 0
      if (filter === 'FX') return p.kind === 1
      if (filter === 'JOB') return p.kind === 2
      return true
    })
  }, [pacts, filter])

  const stats = useMemo(() => {
    const total = pacts.length
    const live = pacts.filter(p => p.status === 2).length
    const cleared = pacts.filter(p => p.status === 4).length
    return { total, live, cleared }
  }, [pacts])

  return (
    <main className="min-h-screen max-w-[880px] mx-auto pt-8 px-4 sm:px-6 pb-20 flex flex-col">
      {/* Top Navbar */}
      <Navbar />

      {/* 30-Second Product Primer & Testnet Quickstart */}
      <section className="bg-[#111215] border border-[#1e1f25] rounded-lg p-4 sm:p-5 mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4 border-b border-[#1c1d22]">
          <div>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Protocol Overview (30s)
            </span>
            <h2 className="text-sm font-semibold text-zinc-100 mt-2">
              Trustless Bilateral Escrow & Atomic Settlement on Arc
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl leading-relaxed">
              PACT allows counterparties to lock crypto assets into immutable smart contracts tied to verifiable terms, counterparty bonds, and automatic timeout resolution.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <Link
              href="/new"
              className="inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 text-xs font-mono font-bold rounded-md transition-all shadow-sm cursor-pointer"
            >
              ⚡ Test Happy Path (3 min) →
            </Link>
          </div>
        </div>

        {/* 3 Steps Visual Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#0e0f12] border border-[#1c1d22] p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold flex items-center justify-center border border-emerald-500/20">1</span>
              <span className="text-xs font-medium text-zinc-200">Create & Lock</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Maker deposits USDC/EURC into smart contract and binds SHA-256 agreement terms.
            </p>
          </div>

          <div className="bg-[#0e0f12] border border-[#1c1d22] p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 font-mono text-[10px] font-bold flex items-center justify-center border border-amber-500/20">2</span>
              <span className="text-xs font-medium text-zinc-200">Fulfill & Bond</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Taker deposits collateral bond and submits cryptographic delivery/proof reference.
            </p>
          </div>

          <div className="bg-[#0e0f12] border border-[#1c1d22] p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 font-mono text-[10px] font-bold flex items-center justify-center border border-zinc-700">3</span>
              <span className="text-xs font-medium text-zinc-200">Release or Settle</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Maker releases payout upon satisfaction, or automated expiry refunds/slashes on timeout.
            </p>
          </div>
        </div>
      </section>

      {/* Protocol Metrics Bar */}
      <section className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-3">
          <span className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Total Contracts</span>
          <span className="text-lg font-mono font-bold text-zinc-100">{loading ? '—' : stats.total}</span>
        </div>
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-3">
          <span className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Active Escrows</span>
          <span className="text-lg font-mono font-bold text-amber-400">{loading ? '—' : stats.live}</span>
        </div>
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-3">
          <span className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Cleared & Settled</span>
          <span className="text-lg font-mono font-bold text-emerald-400">{loading ? '—' : stats.cleared}</span>
        </div>
      </section>

      {/* Filter Tabs & Ledger Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1 p-1 bg-[#111215] border border-[#1e1f25] rounded-md overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Pacts' },
            { id: 'DELIVERY', label: 'Delivery' },
            { id: 'FX', label: 'FX Swap' },
            { id: 'JOB', label: 'Job' },
            { id: 'LIVE', label: '● Live' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#222329] text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono text-zinc-500 hidden sm:inline-block">
          Live sync on Arc Testnet
        </span>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-[#111215] border border-[#1e1f25] rounded-md overflow-hidden flex flex-col flex-1 shadow-sm">
        {/* Table Header */}
        <div className="hidden sm:flex items-center justify-between py-2.5 px-4 bg-[#0d0e11] border-b border-[#1c1d22] text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
          <div className="flex items-center gap-4">
            <span className="w-12">Pact</span>
            <span className="w-20">Type</span>
            <span>Status</span>
          </div>
          <div className="flex items-center gap-6">
            <span>Collateral / Lock</span>
            <span className="w-24 text-right">Counterparty</span>
          </div>
        </div>

        {/* Ledger Rows */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-400 font-mono text-xs gap-3">
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Reading on-chain ledger...</span>
          </div>
        ) : filteredPacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3 font-mono text-sm">
              Ø
            </div>
            <p className="text-sm font-medium text-zinc-300 mb-1">No pact records found</p>
            <p className="text-xs text-zinc-500 mb-4 max-w-sm">
              {filter === 'ALL'
                ? 'No smart contracts have been initialized on the tape yet. Create the first one to start.'
                : `No pacts currently match the "${filter}" filter criteria.`}
            </p>
            <Link
              href="/new"
              className="inline-flex items-center gap-1 text-xs font-mono font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              Initialize new pact →
            </Link>
          </div>
        ) : (
          filteredPacts.map((p) => {
            const amountDisplay = p.kind === 1
              ? `$${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ $${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
              : `$${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`

            return (
              <TapeLine
                key={p.id}
                pact={{
                  id: p.id,
                  time: formatTimestamp(p.updatedAt),
                  kind: kindLabel(p.kind),
                  status: p.status === 2 ? 'LIVE' : statusLabel(p.status),
                  amount: amountDisplay,
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
