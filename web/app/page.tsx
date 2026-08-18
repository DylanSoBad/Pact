'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import TapeLine from '../components/TapeLine'
import ConnectButton from '../components/ConnectButton'
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
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-[#1c1d22]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-[#18191d] border border-[#27282e] flex items-center justify-center font-mono font-bold text-xs text-zinc-100 shadow-sm">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100">PACT PROTOCOL</h1>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                Arc Testnet
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Trustless collateral escrow and atomic settlement ledger</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectButton />
          <Link
            href="/new"
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black px-3.5 py-1.5 text-xs font-mono font-bold rounded-md transition-all shadow-sm cursor-pointer"
          >
            <span>+</span> NEW PACT
          </Link>
        </div>
      </header>

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
          Auto-refreshing every 3s
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
