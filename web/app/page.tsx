'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import Hero from '../components/Hero'
import SettlementRail from '../components/SettlementRail'
import RolePerspective from '../components/RolePerspective'
import RolePerspectiveModal from '../components/RolePerspectiveModal'
import SecurityInfrastructure from '../components/SecurityInfrastructure'
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
  kindLabel, effectiveStatusLabel, formatAmount, tokenSymbol,
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
    document.title = 'PACT Protocol'

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

  const marketMetrics = useMemo(() => {
    const list = pacts as PactData[]
    const active = list.filter(p => p.status >= 1 && p.status <= 3)
    const terminal = list.filter(p => p.status >= 4)
    const settled = list.filter(p => p.status === 4)
    const escrowNotional = active.reduce((total, pact) => total + pact.notionalUSDC, 0n)
    const closeTimes = settled
      .map(pact => Number(pact.updatedAt - pact.createdAt))
      .filter(seconds => Number.isFinite(seconds) && seconds >= 0)
      .sort((a, b) => a - b)
    const medianSeconds = closeTimes.length
      ? closeTimes[Math.floor(closeTimes.length / 2)]
      : null

    const formatUsd = (raw: bigint) => {
      const value = Number(raw) / 1_000_000
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', maximumFractionDigits: value >= 1000 ? 0 : 2,
      }).format(value)
    }
    const formatDuration = (seconds: number | null) => {
      if (seconds === null) return '—'
      const days = Math.floor(seconds / 86_400)
      const hours = Math.floor((seconds % 86_400) / 3_600)
      return days > 0 ? `${days}d ${hours}h` : `${hours}h`
    }

    return {
      escrow: formatUsd(escrowNotional),
      settlementRate: terminal.length ? `${((settled.length / terminal.length) * 100).toFixed(1)}%` : '—',
      medianClose: formatDuration(medianSeconds),
      activeCount: active.length,
      terminalCount: terminal.length,
    }
  }, [pacts])

  return (
    <div className="w-full space-y-10">
      {/* 4-Column Real Indexed Metrics Bar */}
      <section aria-label="Market Statistics" className="grid grid-cols-2 border border-outline-hairline bg-outline-hairline lg:grid-cols-4 gap-px animate-enter">
        {[
          ['Total agreements', isLoading ? '…' : String(pacts.length), `${activity.open} open offer${activity.open === 1 ? '' : 's'}`],
          ['Capital in escrow', isLoading ? '…' : marketMetrics.escrow, `Across ${marketMetrics.activeCount} active pact${marketMetrics.activeCount === 1 ? '' : 's'}`],
          ['Settlement rate', isLoading ? '…' : marketMetrics.settlementRate, `${marketMetrics.terminalCount} terminal pact${marketMetrics.terminalCount === 1 ? '' : 's'}`],
          ['Median close', isLoading ? '…' : marketMetrics.medianClose, 'From funding to settlement'],
        ].map(([label, value, detail], index) => (
          <article key={label} className="pact-metric-card min-h-[132px] bg-[#0b0f0c] p-5 sm:p-6" style={{ animationDelay: `${index * 90}ms` }}>
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
            <p className="mt-6 font-editorial text-[28px] leading-none tracking-[-0.025em] text-white tabular-nums sm:text-[30px]">{value}</p>
            <p className="mt-1 font-body-sans text-[11px] text-text-dim">{detail}</p>
          </article>
        ))}
      </section>

      {/* Main The Tape & Protocol Pulse Grid */}
      <div className="grid items-start gap-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-9">
          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-hairline pb-5 animate-enter">
            <div>
              <p className="pact-eyebrow mb-1">Live agreements</p>
              <h2 className="font-editorial text-[28px] font-normal leading-8 tracking-[-0.025em] text-white sm:text-[30px]">
                The Tape <span className="align-middle text-[12px] font-normal text-text-dim">{filtered.length}</span>
              </h2>
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
          <section aria-label="PACT Contract Feed" className="pact-tape-panel relative border border-outline-hairline bg-[#0c0f12] overflow-hidden animate-enter">
            {/* Table Header (Desktop >= md) */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-outline-hairline bg-[#07080a] font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
              <div className="col-span-5">AGREEMENT</div>
              <div className="col-span-2">STATUS</div>
              <div className="col-span-3">COLLATERAL</div>
              <div className="col-span-2 text-right">MATURITY</div>
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
                        rawPact: p,
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
        </div>

        {/* Protocol Pulse Sidebar */}
        <aside aria-label="Protocol pulse" className="border-l border-outline-hairline pl-5 lg:col-span-3 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <p className="font-label-caps text-[11px] font-bold uppercase tracking-[0.12em] text-primary-fixed">Protocol pulse</p>
            <span className={`h-2 w-2 rounded-full ${sseConnected ? 'bg-primary-fixed live-dot' : 'bg-amber-400'}`} aria-hidden="true" />
          </div>
          <div className="mt-5 space-y-6">
            {pacts.slice(0, 3).map((pact: PactData) => {
              const age = Math.max(0, currentTime - Number(pact.updatedAt))
              const ageLabel = age < 60 ? 'NOW' : age < 3600 ? `${Math.floor(age / 60)} MIN AGO` : age < 86400 ? `${Math.floor(age / 3600)} HR AGO` : `${Math.floor(age / 86400)}D AGO`
              const status = effectiveStatusLabel(pact.status, pact.offerExpiry, pact.disputeDeadline, BigInt(currentTime))
              return (
                <Link key={pact.id} href={`/p/${pact.id}`} className="pact-pulse-item group relative block pl-5">
                  <span className="pact-pulse-node absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary-fixed shadow-[0_0_10px_rgba(200,245,66,0.5)]" aria-hidden="true" />
                  <span className="font-code-hash text-[9px] uppercase tracking-wider text-text-dim">{ageLabel}</span>
                  <p className="mt-1 text-[12px] leading-5 text-text-muted transition-colors group-hover:text-white">
                    Pact #{String(pact.id).padStart(4, '0')} is {status.toLowerCase()} with {formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)} committed.
                  </p>
                </Link>
              )
            })}
            {!isLoading && pacts.length === 0 && <p className="text-[12px] leading-5 text-text-dim">Waiting for the first indexed agreement.</p>}
          </div>
          <Link href="/new" className="pact-button-primary mt-8 w-full justify-between px-5">
            Create a pact <span aria-hidden="true">↗</span>
          </Link>
        </aside>
      </div>
    </div>
  )
}

function ProtocolIntro() {
  const [open, setOpen] = useState(false)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('pact-protocol-intro-seen') !== 'true') {
      previousActiveElement.current = document.activeElement as HTMLElement | null
      setOpen(true)
    }
  }, [])

  const close = useCallback((goToFeatures = false) => {
    sessionStorage.setItem('pact-protocol-intro-seen', 'true')
    setOpen(false)
    if (goToFeatures) {
      requestAnimationFrame(() => {
        document.getElementById('live-pacts')?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus close button on open
    requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      // Restore focus on close
      previousActiveElement.current?.focus?.()
    }
  }, [open, close])

  if (!open) return null

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="protocol-intro-title"
      className="pact-intro-overlay fixed inset-0 z-[100] overflow-y-auto bg-[#070a08] text-white"
    >
      <div className="pact-tape-surface flex min-h-full items-center px-4 py-10 sm:px-8 lg:px-14">
        <div className="relative mx-auto w-full max-w-[1368px] border-y border-outline-hairline py-8 sm:py-10">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => close(false)}
            aria-label="Close protocol introduction"
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-[1px] border border-outline-border bg-[#0c0f12] text-[22px] text-text-muted transition-colors hover:border-primary-fixed hover:text-primary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fixed sm:right-6 sm:top-6"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="pr-14">
            <p className="pact-eyebrow mb-1">Architecture & Settlement Flow</p>
            <h1 id="protocol-intro-title" className="font-editorial text-[30px] font-normal tracking-[-0.025em] sm:text-[36px]">
              How PACT Works
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-muted">
              Three steps turn written terms into a verifiable, collateral-backed settlement on Arc Testnet.
            </p>
          </div>

          {/* Three Connected Stage Cards */}
          <div className="relative mt-8 grid gap-4 md:grid-cols-3">
            {/* Subtle connecting settlement line for desktop */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-primary-fixed/20 via-primary-fixed/40 to-primary-fixed/20 md:block"
            />

            {[
              ['01', 'Anchor Written Terms', 'Specify deal type, counterparties, deadlines, and plaintext terms. A cryptographic SHA-256 digest anchors the exact agreement on-chain.'],
              ['02', 'Exact Collateral Lock', 'Maker and counterparty authorize and lock the exact escrow amount via permit or allowance. PACT never requests unlimited token access.'],
              ['03', 'Settlement & Dispute Bond', 'Funds are settled on completion or refunded on expiration. A 5% bonded dispute mechanism protects against frivolous contestation.'],
            ].map(([number, title, copy], index) => (
              <article
                key={number}
                className="pact-explainer-card relative min-h-[160px] rounded-[1px] border border-outline-hairline bg-[#0c0f12] p-5 sm:p-6"
                style={{ animationDelay: `${160 + index * 100}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display-mono text-[13px] font-bold text-primary-fixed">{number}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-fixed/50" aria-hidden="true" />
                </div>
                <h2 className="mt-3 font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">{title}</h2>
                <p className="mt-2.5 font-body-sans text-[12px] leading-5 text-text-muted">{copy}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => close(false)}
              className="pact-button-secondary min-h-[48px] px-6"
            >
              View introduction hero
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className="pact-button-primary min-h-[48px] px-7"
            >
              Skip to features <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <div className="w-full flex flex-col">
      {/* 1. Protocol Intro Gate */}
      <ProtocolIntro />

      {/* 1b. Role Perspective Floating Modal on Entry */}
      <RolePerspectiveModal />

      {/* 2. Cinematic Hero */}
      <Hero />

      {/* 3. Interactive Settlement Rail */}
      <SettlementRail />

      {/* 4. Role Perspective Section */}
      <RolePerspective />

      {/* 5 & 6. Live Protocol Metrics, The Tape & Protocol Pulse */}
      <div
        id="live-pacts"
        className="pact-tape-surface mx-auto w-full max-w-[1440px] px-3 py-10 sm:px-8 sm:py-16 lg:px-14 pb-16 sm:pb-20 space-y-6 scroll-mt-16 sm:scroll-mt-20"
      >
        <ErrorBoundary>
          <TapeDashboard />
        </ErrorBoundary>
      </div>

      {/* 7. Security & Contract Verification */}
      <SecurityInfrastructure />
    </div>
  )
}
