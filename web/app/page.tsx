'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import TapeLine from '../components/TapeLine'
import TableSkeleton from '../components/TableSkeleton'
import NetworkStatusBanner from '../components/NetworkStatusBanner'
import ErrorBoundary from '../components/ErrorBoundary'
import OnboardingModal from '../components/OnboardingModal'
import { fetchPactPage, PactData } from '../lib/reads'
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
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('pact-onboarding-seen') !== 'true') setShowOnboarding(true)
    document.title = 'PACT · The Tape'
  }, [])

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem('pact-onboarding-seen', 'true')
    setShowOnboarding(false)
  }, [])

  // Wagmi block number watcher
  const { data: wagmiBlockNumber } = useBlockNumber({ watch: true })

  // TanStack Query for caching and smart RPC fetching
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['pacts', getPactAddress()],
    queryFn: ({ pageParam }) => fetchPactPage({ cursor: pageParam, limit: 25 }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 5000,
    gcTime: 60000,
    retry: 2,
  })
  const pacts = useMemo(() => data?.pages.flatMap(page => page.items) ?? [], [data])

  // SSE real-time stream listener
  const handleNewBlock = useCallback(() => {
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
      if (filter === 'LIVE') return p.status >= 1 && p.status <= 3
      if (filter === 'DELIVERY') return p.kind === 0
      if (filter === 'JOB') return p.kind === 1
      return true
    })
  }, [pacts, filter])

  const counts = useMemo(() => ({
    ALL: pacts.length,
    DELIVERY: pacts.filter((p: PactData) => p.kind === 0).length,
    JOB: pacts.filter((p: PactData) => p.kind === 1).length,
  }), [pacts])

  const activity = useMemo(() => ({
    open: pacts.filter((p: PactData) => p.status === 0).length,
    inProgress: pacts.filter((p: PactData) => p.status >= 1 && p.status <= 3).length,
    settled: pacts.filter((p: PactData) => p.status === 4).length,
  }), [pacts])

  const getFilterClass = (f: FilterCategory) => {
    if (filter === f) {
      return 'px-2.5 @md:px-3 py-1 border border-primary-fixed text-primary-fixed bg-primary-fixed/20 font-bold rounded-DEFAULT text-[11px] font-label-caps uppercase transition-all focus-visible:ring-2 focus-visible:ring-primary-fixed'
    }
    return 'px-2.5 @md:px-3 py-1 border border-outline-hairline text-text-muted hover:border-primary-fixed hover:bg-primary-fixed/10 hover:text-primary-fixed hover:scale-105 transition-all rounded-DEFAULT text-[11px] font-label-caps uppercase focus-visible:ring-2 focus-visible:ring-primary-fixed'
  }

  return (
    <div className="w-full px-2 @md:px-0">
      {/* Header & Subhead */}
      <header className="mb-5 @md:mb-xl @lg:max-w-terminal @lg:mx-auto">
        <h1 className="font-display-mono text-[26px] @md:text-[32px] leading-tight text-on-surface tracking-tighter mb-1 @md:mb-2 animate-enter">
          Pact overview
        </h1>
        <p className="font-code-hash text-[11px] @md:text-code-hash text-text-muted animate-enter-delay">
          Track collateral agreements and the actions that need your attention.
        </p>
      </header>

      {/* Network Error Banner */}
      {isError && (
        <div className="@lg:max-w-terminal @lg:mx-auto">
          <NetworkStatusBanner onRetry={() => refetch()} isRetrying={isFetching} />
        </div>
      )}

      {/* Decision-first overview */}
      <OnboardingModal open={showOnboarding && !isLoading && pacts.length === 0} onClose={dismissOnboarding} />
      <section className="@lg:max-w-terminal @lg:mx-auto mb-5 grid gap-3 @md:grid-cols-[1.45fr_1fr] animate-enter" style={{ animationDelay: '70ms' }}>
        <div className="relative overflow-hidden border border-primary-fixed/35 bg-gradient-to-br from-primary-fixed/12 via-[#101409] to-[#0c0d10] p-4 @md:p-5">
          <div className="ambient-orbit absolute -right-10 -top-12 h-32 w-32 rounded-full border border-primary-fixed/20" />
          <p className="relative max-w-[36rem] font-body-sans text-[13px] leading-6 text-text-muted"><strong className="mr-1.5 font-display-mono text-[17px] text-primary-fixed @md:text-[19px]">Collateral agreements.</strong> Clear terms and pull-based settlement for delivery and job pacts, with bounded arbitration.</p>
        </div>

        <div className="grid grid-cols-3 gap-px border border-outline-hairline bg-outline-hairline">
          {[
            ['Open', activity.open, 'Available to fund'],
            ['Active', activity.inProgress, 'In progress'],
            ['Cleared', activity.settled, 'Settled'],
          ].map(([label, value, hint]) => (
            <div key={label as string} className="flex min-h-24 flex-col justify-between bg-[#0c0d10] p-2.5 @md:min-h-28 @md:p-4">
              <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
              <strong className="font-display-mono text-[22px] text-on-surface @md:text-[26px]">{value as number}</strong>
              <span className="hidden font-body-sans text-[11px] leading-4 text-text-dim @sm:block">{hint as string}</span>
            </div>
          ))}
        </div>
      </section>

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
        aria-label="PACT economic contracts feed"
        className="@lg:max-w-terminal @lg:mx-auto bg-[#0c0d10] border border-outline-hairline rounded-DEFAULT overflow-hidden animate-enter" 
        style={{ animationDelay: '150ms' }}
      >
        {/* Table Header (Desktop) */}
        <div 
          className="hidden @md:grid grid-cols-5 gap-4 px-md py-sm border-b border-outline-hairline bg-surface-container-low font-label-caps text-label-caps text-text-muted uppercase"
        >
          <div className="contents">
            <div className="col-span-1">TIME / ID</div>
            <div className="col-span-1">KIND</div>
            <div className="col-span-1 text-right">AMOUNT</div>
            <div className="col-span-1 text-center">STATUS</div>
            <div className="col-span-1 text-right">COUNTERPARTY</div>
          </div>
        </div>

        {/* Table Header (Mobile) */}
        <div 
          className="@md:hidden flex items-center justify-between px-3 py-2 border-b border-outline-hairline bg-surface-container-low font-label-caps text-[10px] text-text-muted uppercase tracking-wider"
        >
          <div className="contents">
            <div>CONTRACT / TIME</div>
            <div>AMOUNT / COUNTERPARTY</div>
          </div>
        </div>

        {/* Tape Rows */}
        <div className="flex flex-col font-code-hash text-code-hash divide-y divide-outline-hairline/40">
          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 @md:py-20 text-center">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-primary-fixed/50 bg-primary-fixed/10 font-display-mono text-primary-fixed">+</div>
              <p className="font-display-mono text-[14px] uppercase tracking-wider text-on-surface">
                {filter === 'ALL' ? 'No pacts yet' : `No ${filter.toLowerCase()} pacts found`}
              </p>
              <p className="mt-2 max-w-[24rem] font-body-sans text-[13px] leading-5 text-text-muted">The tape only shows verified on-chain activity. Create the first agreement to start your shared history.</p>
              <p className="mt-5 font-label-caps text-[10px] uppercase tracking-wider text-primary-fixed">Use New Pact in the top bar to begin</p>
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
                    status: statusLabel(p.status),
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
          {hasNextPage ? (
            <button type="button" disabled={isFetchingNextPage} onClick={() => fetchNextPage()} className="font-label-caps text-[11px] uppercase tracking-wider text-primary-fixed disabled:opacity-50">
              {isFetchingNextPage ? 'Indexing earlier pacts…' : 'Load earlier pacts'}
            </button>
          ) : (
            <span className="font-code-hash text-[11px] @md:text-code-hash text-text-dim">End of indexed history. Awaiting new prints...</span>
          )}
        </div>
      </div>

      <section id="how-it-works" className="@lg:max-w-terminal @lg:mx-auto mt-8 scroll-mt-24">
        <div className="mb-4">
          <p className="pact-eyebrow mb-2">Settlement lifecycle</p>
          <h2 className="font-display-mono text-[18px] text-on-surface">How PACT works</h2>
        </div>
        <div className="grid gap-3 @md:grid-cols-3">
        {[
          ['01', 'Set the agreement', 'Choose a pact type, counterpart, deadline, and terms. The terms hash anchors what both parties agreed to.'],
          ['02', 'Lock only what is needed', 'Each party approves and funds the exact collateral required for this pact—never an unlimited allowance.'],
          ['03', 'Settle transparently', 'Release, proof, and timeout actions follow the pact state on-chain so every outcome is auditable.'],
        ].map(([step, title, body]) => (
          <article key={step} className="border border-outline-hairline bg-surface-container-lowest p-4">
            <span className="font-display-mono text-[12px] text-primary-fixed">{step}</span>
            <h3 className="mt-5 font-headline-mono text-[14px] uppercase tracking-wide text-on-surface">{title}</h3>
            <p className="mt-2 font-body-sans text-[12px] leading-5 text-text-muted">{body}</p>
          </article>
        ))}
        </div>
      </section>
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
