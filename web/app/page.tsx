'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import TapeLine from '../components/TapeLine'
import TableSkeleton from '../components/TableSkeleton'
import NetworkStatusBanner from '../components/NetworkStatusBanner'
import ErrorBoundary from '../components/ErrorBoundary'
import { fetchPacts, PactData } from '../lib/reads'
import { getPactAddress } from '../lib/arc'
import { useBlockNumber } from 'wagmi'
import { usePactStore, FilterCategory } from '../lib/store/usePactStore'
import { usePactStream } from '../hooks/usePactStream'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../lib/format'

function TapeDashboard() {
  const { filter, setFilter, sseConnected, lastBlockTimestamp, setBlockInfo } = usePactStore()
  const [secondsAgo, setSecondsAgo] = useState(0)

  // Wagmi block number watcher
  const { data: wagmiBlockNumber } = useBlockNumber({ watch: true })

  // TanStack Query for caching and smart RPC fetching
  const {
    data: pacts = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['pacts', getPactAddress()],
    queryFn: async () => {
      const contractAddress = getPactAddress()
      return await fetchPacts(50, contractAddress)
    },
    staleTime: 5000,
    gcTime: 60000,
    retry: 2,
  })

  // SSE real-time stream listener
  const handleNewBlock = useCallback((blockNum: bigint) => {
    refetch()
  }, [refetch])

  usePactStream(handleNewBlock)

  // Sync Wagmi block update
  useEffect(() => {
    if (wagmiBlockNumber) {
      setBlockInfo(wagmiBlockNumber)
      refetch()
    }
  }, [wagmiBlockNumber, setBlockInfo, refetch])

  // Timer counter for "Last block: Xs ago"
  useEffect(() => {
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - lastBlockTimestamp) / 1000))
      setSecondsAgo(diff)
    }
    updateTimer()
    const t = setInterval(updateTimer, 1000)
    return () => clearInterval(t)
  }, [lastBlockTimestamp])

  const filtered = useMemo(() => {
    return (pacts as PactData[]).filter((p) => {
      if (filter === 'ALL') return true
      if (filter === 'LIVE') return p.status === 2 || p.status === 3
      if (filter === 'DELIVERY') return p.kind === 0
      if (filter === 'FX') return p.kind === 1
      if (filter === 'JOB') return p.kind === 2
      return true
    })
  }, [pacts, filter])

  const counts = useMemo(() => ({
    ALL: pacts.length,
    DELIVERY: pacts.filter((p: PactData) => p.kind === 0).length,
    FX: pacts.filter((p: PactData) => p.kind === 1).length,
    JOB: pacts.filter((p: PactData) => p.kind === 2).length,
  }), [pacts])

  const getFilterClass = (f: FilterCategory) => {
    if (filter === f) {
      return 'px-2.5 @md:px-3 py-1 border border-primary-fixed text-primary-fixed bg-primary-fixed/10 rounded-DEFAULT text-[11px] font-label-caps uppercase transition-all focus-visible:ring-2 focus-visible:ring-primary-fixed'
    }
    return 'px-2.5 @md:px-3 py-1 border border-outline-hairline text-text-muted hover:border-text-dim hover:text-on-surface transition-colors rounded-DEFAULT text-[11px] font-label-caps uppercase focus-visible:ring-2 focus-visible:ring-primary-fixed'
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

      {/* Network Error Banner */}
      {isError && (
        <div className="@lg:max-w-terminal @lg:mx-auto">
          <NetworkStatusBanner onRetry={() => refetch()} isRetrying={isFetching} />
        </div>
      )}

      {/* Filters & Telemetry Strip */}
      <div 
        className="flex flex-col @sm:flex-row justify-between items-start @sm:items-center gap-3 mb-3 @md:mb-md @lg:max-w-terminal @lg:mx-auto animate-enter" 
        style={{ animationDelay: '100ms' }}
      >
        {/* Filter Chips with Accessible Group */}
        <div 
          role="group" 
          aria-label="Filter contract categories" 
          className="flex items-center gap-1.5 @md:gap-2 font-label-caps text-label-caps uppercase overflow-x-auto hide-scroll w-full @sm:w-auto pb-1 @sm:pb-0"
        >
          <button 
            onClick={() => setFilter('ALL')} 
            aria-pressed={filter === 'ALL'}
            className={getFilterClass('ALL')}
          >
            ALL ({counts.ALL})
          </button>
          <button 
            onClick={() => setFilter('DELIVERY')} 
            aria-pressed={filter === 'DELIVERY'}
            className={getFilterClass('DELIVERY')}
          >
            DELIVERY ({counts.DELIVERY})
          </button>
          <button 
            onClick={() => setFilter('FX')} 
            aria-pressed={filter === 'FX'}
            className={getFilterClass('FX')}
          >
            FX ({counts.FX})
          </button>
          <button 
            onClick={() => setFilter('JOB')} 
            aria-pressed={filter === 'JOB'}
            className={getFilterClass('JOB')}
          >
            JOB ({counts.JOB})
          </button>
          <button 
            onClick={() => setFilter('LIVE')} 
            aria-pressed={filter === 'LIVE'}
            className={`flex items-center gap-1.5 shrink-0 focus-visible:ring-2 focus-visible:ring-status-error ${
              filter === 'LIVE' 
                ? 'px-2.5 @md:px-3 py-1 border border-status-error text-status-error bg-status-error/10 rounded-DEFAULT text-[11px] font-label-caps uppercase' 
                : 'px-2.5 @md:px-3 py-1 border border-outline-hairline text-text-muted hover:border-status-error hover:text-status-error transition-colors rounded-DEFAULT text-[11px] font-label-caps uppercase'
            }`}
            title="Real-time data feed"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-status-error" /> STREAMING
          </button>
          {filter !== 'ALL' && <button onClick={() => setFilter('ALL')} className="px-2 py-1 text-[11px] text-text-muted hover:text-primary-fixed underline focus-visible:ring-2 focus-visible:ring-primary-fixed">Clear filters</button>}
        </div>

        {/* Real-time block & stream counter */}
        <div 
          role="status"
          aria-live="polite"
          className="font-code-hash text-[11px] @md:text-code-hash text-text-muted flex items-center gap-1.5 @md:gap-2 bg-surface-container-low px-2.5 py-1 rounded-DEFAULT border border-outline-hairline shrink-0"
        >
          <span 
            className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-primary-fixed radar-pulse' : 'bg-status-warning'}`} 
            title={sseConnected ? 'Real-time SSE connected' : 'Polling mode active'}
          />
          <span className="material-symbols-outlined text-[13px] @md:text-[14px]">timer</span>
          Last block: <span className="text-primary-fixed">{secondsAgo}s ago</span>
        </div>
      </div>

      {/* The Tape (Semantic Data Table) */}
      <div 
        role="table" 
        aria-label="PACT economic contracts feed"
        aria-live="polite"
        className="@lg:max-w-terminal @lg:mx-auto bg-[#0c0d10] border border-outline-hairline rounded-DEFAULT overflow-hidden animate-enter" 
        style={{ animationDelay: '150ms' }}
      >
        {/* Table Header (Desktop) */}
        <div 
          role="rowgroup" 
          className="hidden @md:grid grid-cols-5 gap-4 px-md py-sm border-b border-outline-hairline bg-surface-container-low font-label-caps text-label-caps text-text-muted uppercase"
        >
          <div role="row" className="contents">
            <div role="columnheader" className="col-span-1">TIME / ID</div>
            <div role="columnheader" className="col-span-1">KIND</div>
            <div role="columnheader" className="col-span-1 text-right">AMOUNT</div>
            <div role="columnheader" className="col-span-1 text-center">STATUS</div>
            <div role="columnheader" className="col-span-1 text-right">COUNTERPARTY</div>
          </div>
        </div>

        {/* Table Header (Mobile) */}
        <div 
          role="rowgroup" 
          className="@md:hidden flex items-center justify-between px-3 py-2 border-b border-outline-hairline bg-surface-container-low font-label-caps text-[10px] text-text-muted uppercase tracking-wider"
        >
          <div role="row" className="contents">
            <div role="columnheader">CONTRACT / TIME</div>
            <div role="columnheader">AMOUNT / COUNTERPARTY</div>
          </div>
        </div>

        {/* Tape Rows */}
        <div role="rowgroup" className="flex flex-col font-code-hash text-code-hash divide-y divide-outline-hairline/40">
          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <div 
              role="status" 
              aria-live="polite" 
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <p className="font-code-hash text-text-muted text-[12px] mb-5">
                DATA STREAM EMPTY
              </p>
              <div className="w-full max-w-xl px-4 grid gap-3 text-left">
                <div className="border border-primary-fixed/40 bg-primary-fixed/5 p-4">
                  <p className="text-primary-fixed text-[11px] uppercase mb-3">How a pact settles</p>
                  <ol className="grid @md:grid-cols-3 gap-3 text-[11px] text-text-muted">
                    <li><span className="text-primary-fixed">01</span> Create a pact — choose Delivery, FX, or Job.</li>
                    <li><span className="text-primary-fixed">02</span> Lock collateral — both parties deposit USDC.</li>
                    <li><span className="text-primary-fixed">03</span> Settle — fulfill conditions or claim timeout.</li>
                  </ol>
                </div>
                {[
                  ['#0001', 'DELIVERY', '250.00 USDC', 'OPEN'],
                  ['#0002', 'FX SWAP', '500.00 USDC', 'ACTIVE'],
                  ['#0003', 'JOB', '120.00 USDC', 'OPEN'],
                ].map(([id, kind, amount, status]) => <div key={id} className="grid grid-cols-4 gap-2 border border-dashed border-outline-border px-3 py-2 text-[11px] text-text-dim opacity-80"><span>{id}</span><span>{kind}</span><span className="text-right">{amount}</span><span className="text-right">{status}</span></div>)}
              </div>
              <Link
                href="/new"
                className="font-code-hash text-primary-fixed underline text-[12px] mt-3 focus-visible:ring-2 focus-visible:ring-primary-fixed focus-visible:outline-none"
              >
                &gt; create new pact
              </Link>
              <a href="#" className="font-code-hash text-text-muted hover:text-primary-fixed underline text-[11px] mt-2 focus-visible:ring-2 focus-visible:ring-primary-fixed">Learn More</a>
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

export default function Home() {
  return (
    <ErrorBoundary>
      <TapeDashboard />
    </ErrorBoundary>
  )
}
