'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
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
  kindLabel, statusLabel, effectiveStatusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../lib/format'

import { useCurrentTime } from '../hooks/useCurrentTime'
import { filterOverviewPacts } from '../lib/filter'

function TapeDashboard() {
  const { filter, setFilter, sseConnected, lastBlockTimestamp, setBlockInfo } = usePactStore()
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const currentTime = useCurrentTime()

  useEffect(() => {
    if (localStorage.getItem('pact-onboarding-seen') !== 'true') setShowOnboarding(true)
    document.title = 'PACT · The Tape (Overview)'

    // Sync URL query state on mount
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const filterParam = params.get('filter')?.toUpperCase() as FilterCategory | null
      const qParam = params.get('q')
      if (filterParam && (['ALL', 'DELIVERY', 'JOB', 'LIVE', 'DISPUTED', 'EXPIRED'] as FilterCategory[]).includes(filterParam)) {
        setFilter(filterParam)
      }
      if (qParam) {
        setSearchQuery(qParam)
      }
    }
  }, [setFilter])

  const updateUrlState = (newFilter: FilterCategory, newSearch: string) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (newFilter === 'ALL') url.searchParams.delete('filter')
      else url.searchParams.set('filter', newFilter)

      if (!newSearch.trim()) url.searchParams.delete('q')
      else url.searchParams.set('q', newSearch.trim())

      window.history.replaceState({}, '', url.toString())
    }
  }

  const handleSetFilter = (newFilter: FilterCategory) => {
    setFilter(newFilter)
    updateUrlState(newFilter, searchQuery)
  }

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    updateUrlState(filter, val)
  }

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
    return filterOverviewPacts(pacts as PactData[], filter, BigInt(currentTime), searchQuery)
  }, [pacts, filter, currentTime, searchQuery])

  const counts = useMemo(() => {
    const list = pacts as PactData[]
    const now = BigInt(currentTime)
    return {
      ALL: list.length,
      DELIVERY: list.filter(p => p.kind === 0).length,
      JOB: list.filter(p => p.kind === 1).length,
      LIVE: list.filter(p => p.status >= 1 && p.status <= 3).length,
      DISPUTED: list.filter(p => p.status === 3).length,
      EXPIRED: list.filter(p => {
        const eff = effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline, now)
        return eff === 'EXPIRED' || p.status === 6
      }).length,
    }
  }, [pacts, currentTime])

  const activity = useMemo(() => ({
    open: pacts.filter((p: PactData) => p.status === 0).length,
    inProgress: pacts.filter((p: PactData) => p.status >= 1 && p.status <= 3).length,
    settled: pacts.filter((p: PactData) => p.status === 4).length,
  }), [pacts])

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-hairline pb-5 animate-enter">
        <div>
          <p className="pact-eyebrow mb-1">Decentralized Escrow & Settlement Feed</p>
          <h1 className="font-display-mono text-[24px] sm:text-[30px] font-bold text-white tracking-tight">
            The Tape
          </h1>
          <p className="mt-1 font-body-sans text-[13px] text-text-muted max-w-xl">
            Verifiable economic agreements and collateral commitments on Arc Testnet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/new"
            className="pact-button-primary px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
            Create New Pact
          </Link>
        </div>
      </header>

      {/* Network Error Banner */}
      {isError && (
        <NetworkStatusBanner onRetry={() => refetch()} isRetrying={isFetching} />
      )}

      {/* Onboarding Modal */}
      <OnboardingModal open={showOnboarding && !isLoading && pacts.length === 0} onClose={dismissOnboarding} />

      {/* Summary KPI Cards */}
      <section aria-label="Market Statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-outline-hairline border border-outline-hairline animate-enter">
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">Total Indexed</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-white tabular-nums">{pacts.length}</span>
            <span className="text-[11px] text-text-dim font-code-hash">On-chain</span>
          </div>
        </div>
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-sky-400">Open Offers</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-sky-400 tabular-nums">{activity.open}</span>
            <span className="text-[11px] text-text-dim font-code-hash">Awaiting Accept</span>
          </div>
        </div>
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-primary-fixed">Active & Locked</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-primary-fixed tabular-nums">{activity.inProgress}</span>
            <span className="text-[11px] text-text-dim font-code-hash">In Escrow</span>
          </div>
        </div>
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-emerald-400">Settled Deals</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-emerald-400 tabular-nums">{activity.settled}</span>
            <span className="text-[11px] text-text-dim font-code-hash">Completed</span>
          </div>
        </div>
      </section>

      {/* Filter Toolbar & Live Telemetry */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-enter">
        {/* Category Filters */}
        <div role="group" aria-label="Filter contract categories" className="flex items-center gap-1.5 overflow-x-auto hide-scroll w-full md:w-auto pb-1 md:pb-0">
          {(['ALL', 'DELIVERY', 'JOB', 'LIVE', 'DISPUTED', 'EXPIRED'] as FilterCategory[]).map(cat => {
            const active = filter === cat
            const count = counts[cat]
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleSetFilter(cat)}
                aria-pressed={active}
                className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
                  active
                    ? 'border border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold'
                    : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white hover:border-outline-variant'
                }`}
              >
                {cat === 'LIVE' ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed live-dot" />
                    LIVE ({count})
                  </span>
                ) : (
                  `${cat} (${count})`
                )}
              </button>
            )
          })}
          {(filter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setFilter('ALL')
                handleSearchChange('')
              }}
              className="px-2 py-1 text-[11px] text-text-dim hover:text-primary-fixed underline transition-colors shrink-0"
            >
              Reset
            </button>
          )}
        </div>

        {/* Search Input & Live Block Status */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <div className="relative flex-1 md:w-48">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-text-dim">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search #ID or address..."
              className="w-full bg-[#07080a] border border-outline-border pl-8 pr-2.5 py-1 text-[11px] font-code-hash text-white placeholder:text-text-dim focus:border-primary-fixed focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-white text-[10px]"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 border border-outline-hairline bg-[#0c0f12] px-3 py-1.5 text-[11px] font-code-hash text-text-muted shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-primary-fixed live-dot' : 'bg-amber-400'}`}
              title={sseConnected ? 'Real-time SSE Stream Connected' : 'Polling RPC Fallback'}
              aria-hidden="true"
            />
            <span className="text-text-dim">Arc:</span>
            <span className="text-white font-bold">#{wagmiBlockNumber ? wagmiBlockNumber.toString() : '—'}</span>
            <span className="text-text-dim hidden sm:inline">· Updated {secondsAgo}s ago</span>
          </div>
        </div>
      </div>

      {/* Semantic Feed Table */}
      <section aria-label="PACT Contract Feed" className="border border-outline-hairline bg-[#0c0f12] overflow-hidden animate-enter">
        {/* Table Header (Desktop >= md) */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-outline-hairline bg-[#07080a] font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
          <div className="col-span-3">TIME / CONTRACT ID</div>
          <div className="col-span-2">AGREEMENT TYPE</div>
          <div className="col-span-3 text-right">COLLATERAL AMOUNT</div>
          <div className="col-span-2 text-center">STATUS</div>
          <div className="col-span-2 text-right">MAKER</div>
        </div>

        {/* Table Header (Mobile < md) */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-outline-hairline bg-[#07080a] font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
          <div>CONTRACT / TIME</div>
          <div>AMOUNT / STATUS</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-outline-hairline/40">
          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center border border-outline-border bg-[#12161b] font-display-mono text-primary-fixed text-lg">
                {filter === 'ALL' ? '+' : 'Ø'}
              </div>
              <p className="font-display-mono text-[14px] font-bold uppercase tracking-wider text-white">
                {filter === 'ALL' ? 'No pacts recorded yet' : `No ${filter.toLowerCase()} pacts found`}
              </p>
              <p className="mt-1.5 max-w-sm font-body-sans text-[12px] leading-5 text-text-muted">
                {filter === 'ALL'
                  ? 'The tape displays verified on-chain escrow commitments. Initiate the first agreement to start verifiable settlement history.'
                  : `No agreements on Arc Testnet currently match the "${filter}" filter criteria.`}
              </p>
              <div className="flex items-center gap-3 mt-5 flex-wrap justify-center">
                {filter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => handleSetFilter('ALL')}
                    className="px-4 py-2 border border-outline-border bg-[#07080a] text-white hover:border-primary-fixed text-[11px] font-bold uppercase tracking-wider transition-colors"
                  >
                    Clear Filter / Show All ({counts.ALL})
                  </button>
                )}
                <Link
                  href="/new"
                  className="pact-button-primary px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
                >
                  Create New Pact
                </Link>
              </div>
            </div>
          ) : (
            filtered.map((p) => {
              const amt = p.kind === 1
                ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
                : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`

              const activeDeadline = p.status === 0
                ? p.offerExpiry
                : p.status === 1
                ? p.performanceDeadline
                : p.status === 2 || p.status === 3
                ? p.disputeDeadline
                : undefined

              return (
                <TapeLine
                  key={p.id}
                  pact={{
                    id: p.id,
                    time: formatTimestamp(p.updatedAt),
                    kind: kindLabel(p.kind),
                    status: effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline),
                    amount: amt,
                    address: truncateAddress(p.maker),
                    deadlineTs: activeDeadline,
                  }}
                />
              )
            })
          )}
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-[#07080a] text-center border-t border-outline-hairline">
          {hasNextPage ? (
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
              className="font-label-caps text-[11px] uppercase tracking-wider text-primary-fixed hover:text-white transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Indexing earlier on-chain records…' : 'Load earlier pacts'}
            </button>
          ) : (
            <span className="font-code-hash text-[11px] text-text-dim">
              End of indexed history · Awaiting next on-chain block
            </span>
          )}
        </div>
      </section>

      {/* Institutional Settlement Lifecycle Explainer */}
      <section id="how-it-works" className="mt-8 pt-6 border-t border-outline-hairline scroll-mt-24">
        <div className="mb-4">
          <p className="pact-eyebrow mb-1">Architecture & Settlement Flow</p>
          <h2 className="font-display-mono text-[18px] font-bold text-white">
            How PACT Works
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="border border-outline-hairline bg-[#0c0f12] p-4 flex flex-col justify-between">
            <div>
              <span className="font-display-mono text-[12px] font-bold text-primary-fixed">01</span>
              <h3 className="mt-2 font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
                Anchor Written Terms
              </h3>
              <p className="mt-2 font-body-sans text-[12px] leading-5 text-text-muted">
                Specify deal type, counterparties, deadlines, and plaintext terms. A cryptographic SHA-256 digest anchors the exact agreement on-chain.
              </p>
            </div>
          </article>
          <article className="border border-outline-hairline bg-[#0c0f12] p-4 flex flex-col justify-between">
            <div>
              <span className="font-display-mono text-[12px] font-bold text-primary-fixed">02</span>
              <h3 className="mt-2 font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
                Exact Collateral Lock
              </h3>
              <p className="mt-2 font-body-sans text-[12px] leading-5 text-text-muted">
                Maker and counterparty authorize and lock the exact escrow amount via permit or allowance. PACT never requests unlimited token access.
              </p>
            </div>
          </article>
          <article className="border border-outline-hairline bg-[#0c0f12] p-4 flex flex-col justify-between">
            <div>
              <span className="font-display-mono text-[12px] font-bold text-primary-fixed">03</span>
              <h3 className="mt-2 font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
                Settlement & Dispute Bond
              </h3>
              <p className="mt-2 font-body-sans text-[12px] leading-5 text-text-muted">
                Funds are settled on completion or refunded on expiration. A 5% bonded dispute mechanism protects against frivolous contestation.
              </p>
            </div>
          </article>
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
