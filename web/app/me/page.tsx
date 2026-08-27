'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import TapeLine from '../../components/TapeLine'
import ActionCenter from '../../components/ActionCenter'
import TableSkeleton from '../../components/TableSkeleton'
import NetworkStatusBanner from '../../components/NetworkStatusBanner'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { useModal } from 'connectkit'
import { toast } from 'sonner'
import { fetchPactPage, fetchReputation, PactData } from '../../lib/reads'
import { USDC_ERC20, EURC, getPactAddress } from '../../lib/arc'
import { PACT_ABI } from '../../lib/abi'
import {
  kindLabel, statusLabel, effectiveStatusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../../lib/format'
import { useCurrentTime } from '../../hooks/useCurrentTime'
import {
  filterPortfolioPacts,
  type PortfolioRoleFilter,
  type PortfolioStatusFilter,
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
    document.title = 'PACT · Portfolio & Account'

    // Parse URL query params on mount
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const roleParam = params.get('role')?.toUpperCase() as PortfolioRoleFilter | null
      const statusParam = params.get('status')?.toUpperCase() as PortfolioStatusFilter | null

      if (roleParam && (['ALL', 'MAKER', 'TAKER'] as PortfolioRoleFilter[]).includes(roleParam)) {
        setRoleFilter(roleParam)
      }
      if (statusParam && (['ALL', 'ACTION_REQUIRED', 'LIVE', 'SETTLED', 'EXPIRED', 'DISPUTED'] as PortfolioStatusFilter[]).includes(statusParam)) {
        setStatusFilter(statusParam)
      }
    }
  }, [])

  const updateUrlParams = (newRole: PortfolioRoleFilter, newStatus: PortfolioStatusFilter) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (newRole === 'ALL') url.searchParams.delete('role')
    else url.searchParams.set('role', newRole)

    if (newStatus === 'ALL') url.searchParams.delete('status')
    else url.searchParams.set('status', newStatus)

    window.history.replaceState({}, '', url.toString())
  }

  const handleSetRoleFilter = (r: PortfolioRoleFilter) => {
    setRoleFilter(r)
    updateUrlParams(r, statusFilter)
  }

  const handleSetStatusFilter = (s: PortfolioStatusFilter) => {
    setStatusFilter(s)
    updateUrlParams(roleFilter, s)
  }

  const handleResetFilters = () => {
    setRoleFilter('ALL')
    setStatusFilter('ALL')
    updateUrlParams('ALL', 'ALL')
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
      console.error('Error loading /me data:', err)
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

  const filteredPacts = useMemo(() => {
    return filterPortfolioPacts(pacts, {
      role: roleFilter,
      status: statusFilter,
      accountAddress: address,
      currentNowTs: BigInt(currentTime)
    })
  }, [pacts, roleFilter, statusFilter, address, currentTime])

  const roleCounts = useMemo(() => {
    if (!address) return { ALL: 0, MAKER: 0, TAKER: 0 }
    const account = address.toLowerCase()
    return {
      ALL: pacts.length,
      MAKER: pacts.filter(p => p.maker.toLowerCase() === account).length,
      TAKER: pacts.filter(p => p.taker.toLowerCase() === account).length,
    }
  }, [pacts, address])

  const statusCounts = useMemo(() => {
    const now = BigInt(currentTime)
    const account = address?.toLowerCase() ?? ''
    const roleRestricted = pacts.filter(p => {
      if (roleFilter === 'MAKER') return p.maker.toLowerCase() === account
      if (roleFilter === 'TAKER') return p.taker.toLowerCase() === account
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

  const hasReputation = Boolean(reputation && (reputation.cleared + reputation.slashed > 0))
  const successRate = hasReputation && reputation
    ? ((reputation.cleared / (reputation.cleared + reputation.slashed)) * 100).toFixed(0)
    : null

  const claimableCredits = Object.entries(credits).filter(([, val]) => val > 0n)

  // Disconnected State
  if (!isConnected) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-10">
        <div className="border border-outline-border bg-[#0c0f12] p-6 sm:p-10 text-center animate-enter">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-outline-border bg-[#12161b] text-primary-fixed">
            <span className="material-symbols-outlined text-[24px]">lock</span>
          </div>
          <p className="pact-eyebrow mb-2">Private On-chain Portfolio</p>
          <h1 className="font-display-mono text-[24px] sm:text-[28px] font-bold text-white tracking-tight">
            Connect Your Wallet
          </h1>
          <p className="mt-3 max-w-md mx-auto font-body-sans text-[13px] leading-6 text-text-muted">
            Connect your Arc Network wallet to view your active escrow commitments, track counterparties, review pending actions, and inspect your on-chain settlement reputation.
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
              What you can do in Portfolio:
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 text-[12px] font-body-sans text-text-muted">
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Monitor your created & counterparty pacts
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Withdraw available escrow refund credits
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Track actions required across active deals
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                Inspect on-chain settlement reputation
              </li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // Connected Portfolio View
  return (
    <div className="w-full space-y-6">
      {/* Portfolio Header & Wallet Identity */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-hairline pb-5 animate-enter">
        <div>
          <p className="pact-eyebrow mb-1">Account Portfolio & Escrow Balances</p>
          <h1 className="font-display-mono text-[24px] sm:text-[30px] font-bold text-white tracking-tight">
            My Portfolio
          </h1>
          <div className="mt-2 flex items-center gap-2 font-code-hash text-[12px]">
            <span className="text-text-muted">Connected:</span>
            <span className="text-white font-bold">{truncateAddress(address || '')}</span>
            <button
              type="button"
              onClick={copyAddress}
              className="text-text-dim hover:text-primary-fixed transition-colors text-[11px] underline"
            >
              {copiedAddr ? 'Copied' : 'Copy'}
            </button>
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

      {/* Overview Metric Cards */}
      <section aria-label="Account Overview" className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-outline-hairline border border-outline-hairline animate-enter">
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">Total Pacts</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-white tabular-nums">{pacts.length}</span>
            <span className="text-[11px] text-text-dim font-code-hash">Participated</span>
          </div>
        </div>
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-primary-fixed">As Maker</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-primary-fixed tabular-nums">{roleCounts.MAKER}</span>
            <span className="text-[11px] text-text-dim font-code-hash">Created</span>
          </div>
        </div>
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-sky-400">As Counterparty</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-sky-400 tabular-nums">{roleCounts.TAKER}</span>
            <span className="text-[11px] text-text-dim font-code-hash">Accepted</span>
          </div>
        </div>
        <div className="bg-[#0c0f12] p-4 flex flex-col justify-between min-h-[90px]">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-emerald-400">Reputation</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display-mono text-[24px] font-bold text-emerald-400 tabular-nums">
              {successRate ? `${successRate}%` : '—'}
            </span>
            <span className="text-[11px] text-text-dim font-code-hash">
              {reputation ? `${reputation.cleared} Cleared` : 'No history'}
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

      {/* Action Center */}
      <ActionCenter pacts={pacts} address={address || ''} />

      {/* Multi-Dimensional Filter Toolbar */}
      <div className="space-y-3 animate-enter">
        {/* Row 1: Role Filters */}
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
          </div>

          <span className="font-code-hash text-[11px] text-text-dim shrink-0">
            Showing {filteredPacts.length} of {pacts.length} agreements
          </span>
        </div>

        {/* Row 2: Status Sub-Filters */}
        <div role="group" aria-label="Filter pacts by status" className="flex items-center gap-1.5 overflow-x-auto hide-scroll w-full pb-1 sm:pb-0">
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
          {(roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              onClick={handleResetFilters}
              className="px-2 py-1 text-[10px] text-text-dim hover:text-primary-fixed underline transition-colors shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Pacts Feed / List */}
      <section aria-label="My Pacts Feed" className="border border-outline-hairline bg-[#0c0f12] overflow-hidden animate-enter">
        {/* Table Header (Desktop) */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-outline-hairline bg-[#07080a] font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
          <div className="col-span-3">TIME / CONTRACT ID</div>
          <div className="col-span-2">AGREEMENT TYPE</div>
          <div className="col-span-3 text-right">COLLATERAL AMOUNT</div>
          <div className="col-span-2 text-center">STATUS</div>
          <div className="col-span-2 text-right">MAKER</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-outline-hairline/40">
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
                {(roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
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
            filteredPacts.map(p => {
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
                    status: effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline, BigInt(currentTime)),
                    amount: amt,
                    address: truncateAddress(p.maker),
                    deadlineTs: activeDeadline,
                  }}
                />
              )
            })
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
        onDismiss={() => {
          setTxStage('idle')
          setTxError('')
          setTxHash(null)
        }}
      />
    </div>
  )
}
