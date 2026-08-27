'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import ActionCenter from '../../components/ActionCenter'
import TableSkeleton from '../../components/TableSkeleton'
import NetworkStatusBanner from '../../components/NetworkStatusBanner'
import Countdown from '../../components/Countdown'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { useModal } from 'connectkit'
import { toast } from 'sonner'
import { fetchPactPage, fetchReputation, PactData } from '../../lib/reads'
import { USDC_ERC20, EURC, getPactAddress } from '../../lib/arc'
import { PACT_ABI } from '../../lib/abi'
import {
  kindLabel, statusLabel, effectiveStatusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress, formatDate
} from '../../lib/format'
import { useCurrentTime } from '../../hooks/useCurrentTime'
import {
  filterPortfolioPacts,
  computeActiveCapitalAtStake,
  computeRoleCounts,
  getRelevantDeadline,
  type PortfolioRoleFilter,
  type PortfolioStatusFilter,
  type PortfolioSortOrder,
  requiresActionFrom
} from '../../lib/filter'
import TransactionProgress, { type TransactionStage } from '../../components/TransactionProgress'
import { transactionErrorMessage } from '../../lib/transactionErrors'

export default function MePage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const protocolAddress = getPactAddress(chainId)
  const { setOpen: openModal } = useModal()
  const currentTime = useCurrentTime()

  const [pacts, setPacts] = useState<PactData[]>([])
  const [reputation, setReputation] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)
  const [credits, setCredits] = useState<Record<string, bigint>>({})
  const [loading, setLoading] = useState(true)
  const [networkError, setNetworkError] = useState(false)
  const [roleFilter, setRoleFilter] = useState<PortfolioRoleFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<PortfolioStatusFilter>('ALL')
  const [sortOrder, setSortOrder] = useState<PortfolioSortOrder>('DEADLINE')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStage, setTxStage] = useState<TransactionStage>('idle')
  const [txLabel, setTxLabel] = useState('')
  const [txError, setTxError] = useState('')
  const inFlightRef = useRef(false)

  useEffect(() => {
    document.title = 'PACT · Executive Portfolio Command Center'

    // Parse URL query params on mount
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const roleParam = params.get('role')?.toUpperCase() as PortfolioRoleFilter | null
      const statusParam = params.get('status')?.toUpperCase() as PortfolioStatusFilter | null
      const sortParam = params.get('sort')?.toUpperCase() as PortfolioSortOrder | null
      const qParam = params.get('q')

      if (roleParam && (['ALL', 'MAKER', 'TAKER', 'ARBITER'] as PortfolioRoleFilter[]).includes(roleParam)) {
        setRoleFilter(roleParam)
      }
      if (statusParam && (['ALL', 'ACTION_REQUIRED', 'LIVE', 'SETTLED', 'EXPIRED', 'DISPUTED'] as PortfolioStatusFilter[]).includes(statusParam)) {
        setStatusFilter(statusParam)
      }
      if (sortParam && (['DEADLINE', 'NEWEST', 'VALUE'] as PortfolioSortOrder[]).includes(sortParam)) {
        setSortOrder(sortParam)
      }
      if (qParam) {
        setSearchQuery(qParam)
      }
    }
  }, [])

  const updateUrlParams = (
    newRole: PortfolioRoleFilter,
    newStatus: PortfolioStatusFilter,
    newSort: PortfolioSortOrder,
    newSearch: string
  ) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (newRole === 'ALL') url.searchParams.delete('role')
      else url.searchParams.set('role', newRole)

      if (newStatus === 'ALL') url.searchParams.delete('status')
      else url.searchParams.set('status', newStatus)

      if (newSort === 'DEADLINE') url.searchParams.delete('sort')
      else url.searchParams.set('sort', newSort)

      if (!newSearch.trim()) url.searchParams.delete('q')
      else url.searchParams.set('q', newSearch.trim())

      window.history.replaceState({}, '', url.toString())
    }
  }

  const handleSetRoleFilter = (r: PortfolioRoleFilter) => {
    setRoleFilter(r)
    updateUrlParams(r, statusFilter, sortOrder, searchQuery)
  }

  const handleSetStatusFilter = (s: PortfolioStatusFilter) => {
    setStatusFilter(s)
    updateUrlParams(roleFilter, s, sortOrder, searchQuery)
  }

  const handleSetSortOrder = (sort: PortfolioSortOrder) => {
    setSortOrder(sort)
    updateUrlParams(roleFilter, statusFilter, sort, searchQuery)
  }

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    updateUrlParams(roleFilter, statusFilter, sortOrder, q)
  }

  const handleResetFilters = () => {
    setRoleFilter('ALL')
    setStatusFilter('ALL')
    setSortOrder('DEADLINE')
    setSearchQuery('')
    updateUrlParams('ALL', 'ALL', 'DEADLINE', '')
  }

  const loadUserData = useCallback(async (cursor: string | null = null, mode: 'replace' | 'refresh' | 'append' = 'refresh') => {
    if (!address) {
      setLoading(false)
      return
    }
    if (inFlightRef.current && mode === 'refresh') return
    inFlightRef.current = true

    try {
      setNetworkError(false)
      const [page, rep] = await Promise.all([
        fetchPactPage({ account: address, cursor, limit: 25 }),
        fetchReputation(address as `0x${string}`)
      ])
      setPacts(current => {
        if (mode === 'replace') return page.items
        const combined = mode === 'append' ? [...current, ...page.items] : [...page.items, ...current]
        return [...new Map(combined.map(pact => [pact.id, pact])).values()].sort((a, b) => b.id - a.id)
      })
      if (mode !== 'refresh') setNextCursor(page.nextCursor)
      setReputation(rep)

      // Check pull payment credits
      if (protocolAddress && publicClient) {
        const tokens = [USDC_ERC20, EURC] as `0x${string}`[]
        const balances = await Promise.all(
          tokens.map(async token => [token, await publicClient.readContract({
            address: protocolAddress,
            abi: PACT_ABI,
            functionName: 'credits',
            args: [address as `0x${string}`, token]
          })] as const)
        )
        setCredits(Object.fromEntries(balances))
      }
    } catch (err) {
      console.error('Error loading executive /me data:', err)
      setNetworkError(true)
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [address, protocolAddress, publicClient])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      await loadUserData(nextCursor, 'append')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    let ok = true
    setLoading(true)
    void loadUserData(null, 'replace')
    const iv = setInterval(() => { if (ok && !document.hidden && address) loadUserData() }, 5000)
    const vis = () => { if (!document.hidden && address) loadUserData() }
    document.addEventListener('visibilitychange', vis)
    return () => { ok = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [address, loadUserData])

  async function withdrawCredits(token: `0x${string}`) {
    if (!address || !protocolAddress || !publicClient || !walletClient) {
      toast.error('Connect an active wallet on Arc Testnet')
      return
    }
    try {
      const sym = tokenSymbol(token)
      setBusyToken(token)
      setTxHash(null)
      setTxError('')
      setTxStage('awaiting-signature')
      setTxLabel(`Withdraw ${sym} escrow credits. Confirm this on-chain transaction in your wallet.`)

      const simulation = await publicClient.simulateContract({
        account: address,
        address: protocolAddress,
        abi: PACT_ABI,
        functionName: 'withdraw',
        args: [token],
      })

      const hash = await walletClient.writeContract(simulation.request)
      setTxHash(hash)
      setTxStage('confirming')
      setTxLabel(`Withdrawal of ${sym} credits is confirming on Arc Testnet.`)

      await publicClient.waitForTransactionReceipt({ hash })
      setTxStage('success')
      setTxLabel(`Successfully withdrawn ${sym} credits to your wallet.`)
      toast.success(`Withdrawn ${sym} credits successfully`)
      await loadUserData()
    } catch (error) {
      const message = transactionErrorMessage(error)
      setTxStage('error')
      setTxError(message)
      toast.error(message)
    } finally {
      setBusyToken(null)
    }
  }

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopiedAddr(true)
      setTimeout(() => setCopiedAddr(false), 2000)
    }
  }

  // Executive Capital & Filter Metrics
  const capitalSummary = useMemo(() => {
    return computeActiveCapitalAtStake(pacts, address || '')
  }, [pacts, address])

  const roleCounts = useMemo(() => {
    return computeRoleCounts(pacts, address || '')
  }, [pacts, address])

  const claimableCredits = Object.entries(credits).filter(([, val]) => val > 0n)
  const totalClaimableCredits = useMemo(() => {
    return Object.values(credits).reduce((acc, v) => acc + v, 0n)
  }, [credits])

  const filteredPacts = useMemo(() => {
    return filterPortfolioPacts(pacts, {
      role: roleFilter,
      status: statusFilter,
      accountAddress: address,
      currentNowTs: BigInt(currentTime),
      searchQuery,
      sortOrder,
    })
  }, [pacts, roleFilter, statusFilter, address, currentTime, searchQuery, sortOrder])

  const pendingActionsCount = useMemo(() => {
    if (!address) return 0
    const now = BigInt(currentTime)
    return pacts.filter(p => requiresActionFrom(p, address, now)).length
  }, [pacts, address, currentTime])

  const statusCounts = useMemo(() => {
    const now = BigInt(currentTime)
    const account = address?.toLowerCase() ?? ''
    const roleRestricted = pacts.filter(p => {
      if (roleFilter === 'MAKER') return p.maker.toLowerCase() === account
      if (roleFilter === 'TAKER') return p.taker.toLowerCase() === account
      if (roleFilter === 'ARBITER') return p.arbiter.toLowerCase() === account
      return true
    })

    return {
      ALL: roleRestricted.length,
      ACTION_REQUIRED: roleRestricted.filter(p => requiresActionFrom(p, account, now)).length,
      LIVE: roleRestricted.filter(p => p.status >= 0 && p.status <= 3).length,
      SETTLED: roleRestricted.filter(p => p.status === 4).length,
      EXPIRED: roleRestricted.filter(p => {
        const eff = effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline, now)
        return eff === 'EXPIRED' || p.status === 5 || p.status === 6
      }).length,
      DISPUTED: roleRestricted.filter(p => p.status === 3).length,
    }
  }, [pacts, address, roleFilter, currentTime])

  // Verified clearance track record (ignoring self-reported unverified notional)
  const totalSettledOrDisputed = (reputation?.cleared || 0) + (reputation?.slashed || 0)
  const successRate = totalSettledOrDisputed > 0 && reputation
    ? ((reputation.cleared / totalSettledOrDisputed) * 100).toFixed(0)
    : null

  // Disconnected State
  if (!isConnected) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-10">
        <div className="border border-outline-border bg-[#0c0f12] p-6 sm:p-10 text-center animate-enter">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-outline-border bg-[#12161b] text-primary-fixed">
            <span className="material-symbols-outlined text-[24px]">lock</span>
          </div>
          <p className="pact-eyebrow mb-2">Executive Escrow Command Center</p>
          <h1 className="font-display-mono text-[24px] sm:text-[28px] font-bold text-white tracking-tight">
            Connect Your Wallet
          </h1>
          <p className="mt-3 max-w-md mx-auto font-body-sans text-[13px] leading-6 text-text-muted">
            Connect your Arc Network wallet to access your executive command center: inspect active capital at stake, withdraw claimable credits, and prioritize pending commitments.
          </p>
          <button
            type="button"
            onClick={() => openModal(true)}
            className="pact-button-primary mt-6 min-h-[44px] px-6 text-[12px] font-bold uppercase tracking-wider"
          >
            Connect Wallet
          </button>

          <div className="mt-8 pt-6 border-t border-outline-hairline text-left">
            <h2 className="font-headline-mono text-[12px] font-bold uppercase tracking-wider text-white mb-2">
              Executive Command Features:
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 text-[12px] font-body-sans text-text-muted">
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Live capital at stake across Maker & Taker roles
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Instant pull-payment credits withdrawal
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Deadline-prioritized Action Center
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Verified on-chain clearance track record
              </li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Portfolio Header & Wallet Identity */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-hairline pb-5 animate-enter">
        <div>
          <p className="pact-eyebrow mb-1">Personal Pact Command Center</p>
          <h1 className="font-display-mono text-[24px] sm:text-[30px] font-bold text-white tracking-tight">
            Executive Portfolio
          </h1>
          <div className="mt-2 flex items-center gap-2 font-code-hash text-[12px] flex-wrap">
            <span className="text-text-muted">Connected Wallet:</span>
            <span className="text-white font-bold">{truncateAddress(address || '')}</span>
            <button
              type="button"
              onClick={copyAddress}
              className="text-text-dim hover:text-primary-fixed transition-colors text-[11px] underline"
            >
              {copiedAddr ? 'Copied ✓' : 'Copy'}
            </button>
            <a
              href={`https://testnet.arcscan.app/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-label-caps uppercase tracking-wider text-primary-fixed hover:underline flex items-center gap-0.5 ml-1"
            >
              ArcScan ↗
            </a>
          </div>
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
      {networkError && (
        <NetworkStatusBanner onRetry={() => loadUserData(null, 'replace')} isRetrying={loading} />
      )}

      {/* Executive Capital & Status Strip */}
      <section aria-label="Executive Capital Allocation" className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-outline-hairline border border-outline-hairline animate-enter">
        {/* Card 1: Active Collateral at Stake */}
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[100px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-primary-fixed flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed live-dot" />
            Active Capital at Stake
          </span>
          <div className="mt-1">
            <span className="font-display-mono text-[22px] sm:text-[24px] font-bold text-white tabular-nums">
              ${formatAmount(capitalSummary.totalAtStake)}
            </span>
            <span className="text-[10px] text-text-dim block mt-0.5 font-code-hash">
              {capitalSummary.activePactsCount} Active Escrow {capitalSummary.activePactsCount === 1 ? 'Deal' : 'Deals'}
            </span>
          </div>
        </div>

        {/* Card 2: Available Escrow Credits */}
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[100px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">account_balance_wallet</span>
            Claimable Credits
          </span>
          <div className="mt-1">
            <span className="font-display-mono text-[22px] sm:text-[24px] font-bold text-emerald-400 tabular-nums">
              ${formatAmount(totalClaimableCredits)}
            </span>
            <span className="text-[10px] text-text-dim block mt-0.5 font-code-hash">
              {claimableCredits.length > 0 ? 'Ready for 1-Click Withdrawal' : 'No unclaimed credits'}
            </span>
          </div>
        </div>

        {/* Card 3: Actions Due */}
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[100px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">pending_actions</span>
            Actions Required
          </span>
          <div className="mt-1">
            <span className={`font-display-mono text-[22px] sm:text-[24px] font-bold tabular-nums ${pendingActionsCount > 0 ? 'text-orange-400' : 'text-text-muted'}`}>
              {pendingActionsCount}
            </span>
            <span className="text-[10px] text-text-dim block mt-0.5 font-code-hash">
              {pendingActionsCount > 0 ? 'Pending sign, proof, or settlement' : 'All commitments up to date'}
            </span>
          </div>
        </div>

        {/* Card 4: Verified On-Chain Clearance Record */}
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[100px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">verified</span>
            Verified Clearance Rate
          </span>
          <div className="mt-1">
            <span className="font-display-mono text-[22px] sm:text-[24px] font-bold text-white tabular-nums">
              {successRate ? `${successRate}%` : '100%'}
            </span>
            <span className="text-[10px] text-text-dim block mt-0.5 font-code-hash">
              {reputation ? `${reputation.cleared} Cleared · ${reputation.slashed} Disputed` : 'Zero disputes'}
            </span>
          </div>
        </div>
      </section>

      {/* Available Escrow Credits (Pull Payment Hub) */}
      {claimableCredits.length > 0 && (
        <section aria-label="Available Escrow Credits" className="border border-emerald-500/40 bg-[#0c0f12] p-5 animate-enter">
          <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-emerald-400">account_balance_wallet</span>
              <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
                Available Escrow Credits
              </h2>
            </div>
            <span className="px-2 py-0.5 border border-emerald-500/40 bg-emerald-950/20 text-emerald-400 text-[10px] font-bold uppercase font-label-caps">
              Ready for Withdrawal
            </span>
          </div>
          <p className="text-[12px] font-body-sans text-text-muted mb-4">
            Refunds and dispute payouts are held safely in protocol credits to prevent reentrancy and transfer failure lockups.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {claimableCredits.map(([tok, val]) => (
              <div key={tok} className="p-3 border border-outline-hairline bg-[#07080a] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block">Credit Balance</span>
                  <span className="text-white font-display-mono text-[16px] font-bold">
                    {formatAmount(val)} {tokenSymbol(tok)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyToken)}
                  onClick={() => withdrawCredits(tok as `0x${string}`)}
                  className="pact-button-primary min-h-[38px] px-3 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  Withdraw {tokenSymbol(tok)}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Priority Action Center */}
      <ActionCenter pacts={pacts} address={address || ''} />

      {/* Multi-Dimensional Filter & Sort Control Toolbar */}
      <div className="space-y-3 animate-enter">
        {/* Row 1: Role Filters & Sorting Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div role="group" aria-label="Filter pacts by role" className="flex items-center gap-1.5 overflow-x-auto hide-scroll w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleSetRoleFilter('ALL')}
              aria-pressed={roleFilter === 'ALL'}
              className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
                roleFilter === 'ALL'
                  ? 'border border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold'
                  : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white'
              }`}
            >
              ALL ROLES ({roleCounts.ALL})
            </button>
            <button
              type="button"
              onClick={() => handleSetRoleFilter('MAKER')}
              aria-pressed={roleFilter === 'MAKER'}
              className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
                roleFilter === 'MAKER'
                  ? 'border border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold'
                  : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white'
              }`}
            >
              AS MAKER ({roleCounts.MAKER})
            </button>
            <button
              type="button"
              onClick={() => handleSetRoleFilter('TAKER')}
              aria-pressed={roleFilter === 'TAKER'}
              className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
                roleFilter === 'TAKER'
                  ? 'border border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold'
                  : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white'
              }`}
            >
              AS COUNTERPARTY ({roleCounts.TAKER})
            </button>
            <button
              type="button"
              onClick={() => handleSetRoleFilter('ARBITER')}
              aria-pressed={roleFilter === 'ARBITER'}
              className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
                roleFilter === 'ARBITER'
                  ? 'border border-purple-400 bg-purple-400 text-[#090b0d] font-bold'
                  : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white'
              }`}
            >
              AS ARBITER ({roleCounts.ARBITER})
            </button>
          </div>

          {/* Priority Sort Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <span className="font-code-hash text-[11px] text-text-dim shrink-0">Sort By:</span>
            <select
              value={sortOrder}
              onChange={(e) => handleSetSortOrder(e.target.value as PortfolioSortOrder)}
              className="bg-[#07080a] border border-outline-border text-white text-[11px] font-code-hash px-2.5 py-1 focus:border-primary-fixed focus:outline-none transition-colors"
            >
              <option value="DEADLINE">⏱ Urgent Deadlines First</option>
              <option value="NEWEST">Latest ID (Newest)</option>
              <option value="VALUE">Highest Collateral ($)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Status Sub-Filters & Quick Search */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
          <div role="group" aria-label="Filter pacts by status" className="flex items-center gap-1.5 overflow-x-auto hide-scroll w-full md:w-auto pb-1 md:pb-0">
            {(['ALL', 'ACTION_REQUIRED', 'LIVE', 'SETTLED', 'EXPIRED', 'DISPUTED'] as PortfolioStatusFilter[]).map(st => {
              const active = statusFilter === st
              const count = statusCounts[st]
              const label = st === 'ACTION_REQUIRED' ? 'ACTION DUE' : st

              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleSetStatusFilter(st)}
                  aria-pressed={active}
                  className={`px-2.5 py-1 font-label-caps text-[10px] uppercase tracking-wider transition-colors shrink-0 ${
                    active
                      ? 'border border-amber-400 bg-amber-400 text-[#090b0d] font-bold'
                      : 'border border-outline-hairline bg-[#07080a] text-text-dim hover:text-white hover:border-outline-border'
                  }`}
                >
                  {st === 'ACTION_REQUIRED' ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 live-dot" />
                      ACTION DUE ({count})
                    </span>
                  ) : (
                    `${label} (${count})`
                  )}
                </button>
              )
            })}
            {(roleFilter !== 'ALL' || statusFilter !== 'ALL' || sortOrder !== 'DEADLINE' || searchQuery) && (
              <button
                onClick={handleResetFilters}
                className="px-2 py-1 text-[10px] text-text-dim hover:text-primary-fixed underline transition-colors shrink-0"
              >
                Reset All
              </button>
            )}
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-56">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-text-dim">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search #ID, address, or terms..."
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
        </div>
      </div>

      {/* Main Executive Command Feed (Dual Presentation: Desktop Table + Mobile Cards) */}
      <section aria-label="Executive Pact Directory" className="border border-outline-hairline bg-[#0c0f12] overflow-hidden animate-enter">
        {/* Table Header (Desktop >= md) */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-outline-hairline bg-[#07080a] font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
          <div className="col-span-3">TIME / CONTRACT ID</div>
          <div className="col-span-2">TYPE & TERMS</div>
          <div className="col-span-3">ROLE & COUNTERPARTY</div>
          <div className="col-span-2 text-right">COLLATERAL</div>
          <div className="col-span-2 text-right">STATUS / ACTION</div>
        </div>

        {/* Rows (Desktop Table + Mobile Cards) */}
        <div>
          {loading ? (
            <TableSkeleton rows={6} />
          ) : filteredPacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center border border-outline-border bg-[#12161b] font-display-mono text-text-muted text-lg">
                Ø
              </div>
              <p className="font-display-mono text-[14px] font-bold uppercase tracking-wider text-white">
                {pacts.length === 0
                  ? 'No on-chain agreements recorded for this wallet'
                  : `No agreements found matching ${roleFilter !== 'ALL' ? `Role: ${roleFilter}` : ''} ${statusFilter !== 'ALL' ? `Status: ${statusFilter}` : ''}`}
              </p>
              <p className="mt-1.5 max-w-sm font-body-sans text-[12px] leading-5 text-text-muted">
                {pacts.length === 0
                  ? 'Create a new agreement to lock maker collateral and send an offer to your designated counterparty.'
                  : 'Adjust or reset your active filters to inspect all account commitments.'}
              </p>
              <div className="flex items-center gap-3 mt-5 flex-wrap justify-center">
                {(roleFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery) && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-4 py-2 border border-outline-border bg-[#07080a] text-white hover:border-primary-fixed text-[11px] font-bold uppercase tracking-wider transition-colors"
                  >
                    Reset Filters ({pacts.length} Total)
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
            <div className="divide-y divide-outline-hairline/40">
              {filteredPacts.map(p => {
                const userAddr = address?.toLowerCase() ?? ''
                const isMaker = p.maker.toLowerCase() === userAddr
                const isTaker = p.taker.toLowerCase() === userAddr
                const isArbiter = p.arbiter.toLowerCase() === userAddr
                const counterparty = isMaker ? p.taker : p.maker
                const activeDeadline = getRelevantDeadline(p)
                const isLive = p.status >= 0 && p.status <= 3
                const amt = p.kind === 1
                  ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
                  : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`

                return (
                  <div key={p.id}>
                    {/* Desktop Row (>= md) */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-[#12161b]/60 transition-colors font-code-hash text-[12px]">
                      {/* Col 1: Time / ID */}
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/p/${p.id}`}
                            className="text-white font-bold hover:text-primary-fixed transition-colors font-code-hash"
                          >
                            #{String(p.id).padStart(4, '0')}
                          </Link>
                          {isLive && (
                            <Countdown deadlineTs={activeDeadline} compact showLabel={false} />
                          )}
                        </div>
                        <span className="text-[10px] text-text-dim block mt-0.5">{formatTimestamp(p.updatedAt)}</span>
                      </div>

                      {/* Col 2: Type & Terms */}
                      <div className="col-span-2">
                        <span className="text-white font-medium block">{kindLabel(p.kind)}</span>
                        <span className="text-[10px] text-text-dim block truncate max-w-[120px]" title={p.termsHash}>
                          {p.termsHash.slice(0, 10)}…
                        </span>
                      </div>

                      {/* Col 3: Role & Counterparty */}
                      <div className="col-span-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 text-[9px] font-label-caps uppercase font-bold ${
                            isMaker
                              ? 'bg-primary-fixed/10 text-primary-fixed border border-primary-fixed/30'
                              : isTaker
                              ? 'bg-sky-950/30 text-sky-400 border border-sky-500/30'
                              : 'bg-purple-950/30 text-purple-400 border border-purple-500/30'
                          }`}>
                            {isMaker ? 'MAKER' : isTaker ? 'COUNTERPARTY' : 'ARBITER'}
                          </span>
                          <span className="text-text-muted text-[11px]">
                            {truncateAddress(counterparty)}
                          </span>
                        </div>
                      </div>

                      {/* Col 4: Collateral */}
                      <div className="col-span-2 text-right">
                        <span className="text-white font-bold block tabular-nums">{amt}</span>
                        <span className="text-[10px] text-text-dim block">
                          Bond: ${formatAmount(p.bondAmount)}
                        </span>
                      </div>

                      {/* Col 5: Status / Action */}
                      <div className="col-span-2 flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 text-[9px] font-label-caps uppercase font-bold ${
                          p.status === 4
                            ? 'text-emerald-400 border border-emerald-500/30 bg-emerald-950/20'
                            : p.status === 3
                            ? 'text-amber-400 border border-amber-500/30 bg-amber-950/20'
                            : p.status >= 5
                            ? 'text-rose-400 border border-rose-500/30 bg-rose-950/20'
                            : 'text-primary-fixed border border-primary-fixed/30 bg-primary-fixed/10'
                        }`}>
                          {effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline, BigInt(currentTime))}
                        </span>
                        <Link
                          href={`/p/${p.id}`}
                          className="text-[11px] text-primary-fixed hover:underline font-bold"
                        >
                          Open Pact →
                        </Link>
                      </div>
                    </div>

                    {/* Mobile Card (< md) */}
                    <div className="md:hidden p-4 space-y-3 hover:bg-[#12161b]/40 transition-colors font-code-hash text-[12px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/p/${p.id}`}
                            className="text-white font-bold text-[14px] hover:text-primary-fixed"
                          >
                            #{String(p.id).padStart(4, '0')}
                          </Link>
                          <span className={`px-1.5 py-0.5 text-[9px] font-label-caps uppercase font-bold ${
                            isMaker
                              ? 'bg-primary-fixed/10 text-primary-fixed border border-primary-fixed/30'
                              : isTaker
                              ? 'bg-sky-950/30 text-sky-400 border border-sky-500/30'
                              : 'bg-purple-950/30 text-purple-400 border border-purple-500/30'
                          }`}>
                            {isMaker ? 'MAKER' : isTaker ? 'COUNTERPARTY' : 'ARBITER'}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 text-[9px] font-label-caps uppercase font-bold ${
                          p.status === 4
                            ? 'text-emerald-400 border border-emerald-500/30 bg-emerald-950/20'
                            : p.status === 3
                            ? 'text-amber-400 border border-amber-500/30 bg-amber-950/20'
                            : p.status >= 5
                            ? 'text-rose-400 border border-rose-500/30 bg-rose-950/20'
                            : 'text-primary-fixed border border-primary-fixed/30 bg-primary-fixed/10'
                        }`}>
                          {effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline, BigInt(currentTime))}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between border-y border-outline-hairline/40 py-2">
                        <div>
                          <span className="text-[10px] uppercase text-text-dim block">Collateral Amount</span>
                          <span className="text-white font-bold text-[14px]">{amt}</span>
                        </div>
                        {isLive && (
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-text-dim block">Time Remaining</span>
                            <Countdown deadlineTs={activeDeadline} compact showLabel={false} />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-text-dim">
                          Counterparty: {truncateAddress(counterparty)}
                        </span>
                        <Link
                          href={`/p/${p.id}`}
                          className="px-3 py-1 bg-[#12161b] border border-outline-border text-primary-fixed text-[11px] font-bold uppercase tracking-wider hover:border-primary-fixed"
                        >
                          Open Pact →
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer / Load More */}
        {nextCursor && (
          <div className="px-4 py-3 bg-[#07080a] text-center border-t border-outline-hairline">
            <button
              type="button"
              disabled={loadingMore}
              onClick={loadMore}
              className="font-label-caps text-[11px] uppercase tracking-wider text-primary-fixed hover:text-white transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading earlier history…' : 'Load earlier account history'}
            </button>
          </div>
        )}
      </section>

      <TransactionProgress
        stage={txStage}
        label={txLabel}
        hash={txHash}
        error={txError}
        onClose={() => setTxStage('idle')}
      />
    </div>
  )
}
