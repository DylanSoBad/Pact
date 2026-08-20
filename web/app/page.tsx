'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import TapeLine from '../components/TapeLine'
import { fetchPacts, PactData } from '../lib/reads'
import { getPactAddress } from '../lib/arc'
import { useAccount, useBlockNumber } from 'wagmi'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../lib/format'

export default function Home() {
  const { address } = useAccount()
  const [filter, setFilter] = useState('ALL')
  const [pacts, setPacts] = useState<PactData[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now())
  const [secondsAgo, setSecondsAgo] = useState(0)

  const { data: blockNumber } = useBlockNumber({ watch: true })

  useEffect(() => { document.title = 'PACT Protocol - The Tape' }, [])

  async function loadData() {
    if (document.hidden) return
    try {
      const contractAddress = getPactAddress()
      const data = await fetchPacts(50, contractAddress)
      setPacts(data)
      setLastFetchTime(Date.now())
      setSecondsAgo(0)
    } catch (err) {
      console.error('RPC Multicall poll error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ok = true
    loadData()
    const vis = () => { if (!document.hidden && ok) loadData() }
    document.addEventListener('visibilitychange', vis)
    return () => { ok = false; document.removeEventListener('visibilitychange', vis) }
  }, [])

  useEffect(() => {
    if (blockNumber) loadData()
  }, [blockNumber])

  useEffect(() => {
    const t = setInterval(() => setSecondsAgo(p => p + 1), 1000)
    return () => clearInterval(t)
  }, [lastFetchTime])

  const filtered = useMemo(() =>
    pacts.filter(p => {
      if (filter === 'ALL') return true
      if (filter === 'LIVE') return p.status === 2 || p.status === 3
      if (filter === 'DELIVERY') return p.kind === 0
      if (filter === 'FX') return p.kind === 1
      if (filter === 'JOB') return p.kind === 2
      return true
    }), [pacts, filter])

  const getFilterClass = (f: string) => {
    if (filter === f) {
      return 'px-2.5 @md:px-3 py-1 border border-primary-fixed text-primary-fixed bg-primary-fixed/10 rounded-DEFAULT text-[11px] font-label-caps uppercase transition-all'
    }
    return 'px-2.5 @md:px-3 py-1 border border-outline-hairline text-text-muted hover:border-text-dim hover:text-on-surface transition-colors rounded-DEFAULT text-[11px] font-label-caps uppercase'
  }

  return (
    <div className="w-full px-2 @md:px-0">
      {/* Header & Subhead */}
      <header className="mb-4 @md:mb-xl @lg:max-w-terminal @lg:mx-auto">
        <h1 className="font-display-mono text-[24px] @md:text-[32px] leading-tight text-on-surface tracking-tighter uppercase mb-1 @md:mb-2 cmd-prompt animate-enter">
          The Tape
        </h1>
        <p className="font-code-hash text-[11px] @md:text-code-hash text-text-muted animate-enter-delay">
          economic contracts with collateral. not a dex.
        </p>
      </header>

      {/* Filters & Telemetry Strip */}
      <div className="flex flex-col @sm:flex-row justify-between items-start @sm:items-center gap-3 mb-3 @md:mb-md @lg:max-w-terminal @lg:mx-auto animate-enter" style={{ animationDelay: '100ms' }}>
        {/* Filter Chips - smooth horizontal scroll on small devices */}
        <div className="flex items-center gap-1.5 @md:gap-2 font-label-caps text-label-caps uppercase overflow-x-auto hide-scroll w-full @sm:w-auto pb-1 @sm:pb-0">
          <button onClick={() => setFilter('ALL')} className={getFilterClass('ALL')}>ALL</button>
          <button onClick={() => setFilter('DELIVERY')} className={getFilterClass('DELIVERY')}>DELIVERY</button>
          <button onClick={() => setFilter('FX')} className={getFilterClass('FX')}>FX</button>
          <button onClick={() => setFilter('JOB')} className={getFilterClass('JOB')}>JOB</button>
          <button 
            onClick={() => setFilter('LIVE')} 
            className={`flex items-center gap-1.5 shrink-0 ${filter === 'LIVE' ? 'px-2.5 @md:px-3 py-1 border border-status-error text-status-error bg-status-error/10 rounded-DEFAULT text-[11px] font-label-caps uppercase' : 'px-2.5 @md:px-3 py-1 border border-outline-hairline text-text-muted hover:border-status-error hover:text-status-error transition-colors rounded-DEFAULT text-[11px] font-label-caps uppercase'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-status-error"></span> LIVE
          </button>
        </div>

        {/* Real-time block counter */}
        <div className="font-code-hash text-[11px] @md:text-code-hash text-text-muted flex items-center gap-1.5 @md:gap-2 bg-surface-container-low px-2 py-1 rounded-DEFAULT border border-outline-hairline shrink-0">
          <span className="material-symbols-outlined text-[13px] @md:text-[14px]">timer</span>
          Last block: <span className="text-primary-fixed">{secondsAgo}s ago</span>
        </div>
      </div>

      {/* The Tape (Data Grid) */}
      <div className="@lg:max-w-terminal @lg:mx-auto bg-[#0c0d10] border border-outline-hairline rounded-DEFAULT overflow-hidden animate-enter" style={{ animationDelay: '150ms' }}>
        {/* Table Header (Desktop) */}
        <div className="hidden @md:grid grid-cols-5 gap-4 px-md py-sm border-b border-outline-hairline bg-surface-container-low font-label-caps text-label-caps text-text-muted uppercase">
          <div className="col-span-1">TIME / ID</div>
          <div className="col-span-1">KIND</div>
          <div className="col-span-1 text-right">AMOUNT</div>
          <div className="col-span-1 text-center">STATUS</div>
          <div className="col-span-1 text-right">COUNTERPARTY</div>
        </div>

        {/* Table Header (Mobile) */}
        <div className="@md:hidden flex items-center justify-between px-3 py-2 border-b border-outline-hairline bg-surface-container-low font-label-caps text-[10px] text-text-muted uppercase tracking-wider">
          <span>CONTRACT / TIME</span>
          <span>AMOUNT / COUNTERPARTY</span>
        </div>

        {/* Tape Rows */}
        <div className="flex flex-col font-code-hash text-code-hash divide-y divide-outline-hairline/40">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-[13px] text-text-muted gap-3 font-code-hash">
              <div className="w-2.5 h-2.5 bg-primary-fixed radar-pulse rounded-full" />
              POLLING CHAIN DATA...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="font-code-hash text-text-muted text-[12px] mb-1">
                DATA STREAM EMPTY
              </p>
              <Link
                href="/new"
                className="font-code-hash text-primary-fixed underline text-[12px] mt-3"
              >
                &gt; create new pact
              </Link>
            </div>
          ) : (
            filtered.map((p, index) => {
              const amt = p.kind === 1
                ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
                : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`
              
              return (
                <div 
                  key={p.id} 
                  className="animate-enter"
                  style={{ animationDelay: `${Math.min(index * 30, 300) + 100}ms`, animationFillMode: 'both' }}
                >
                  <TapeLine pact={{
                    id: p.id,
                    time: formatTimestamp(p.updatedAt),
                    kind: kindLabel(p.kind),
                    status: p.status === 2 ? 'ACTIVE' : p.status === 3 ? 'PROOF IN' : statusLabel(p.status),
                    amount: amt,
                    address: truncateAddress(p.maker),
                  }} />
                </div>
              )
            })
          )}
        </div>

        {/* Tape Footer */}
        <div className="px-3 @md:px-md py-2.5 @md:py-sm bg-surface-container-lowest text-center border-t border-outline-hairline">
          <span className="font-code-hash text-[11px] @md:text-code-hash text-text-dim">End of Tape. Awaiting new prints...</span>
        </div>
      </div>
    </div>
  )
}
