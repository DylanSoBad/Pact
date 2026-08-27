'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import TapeLine from '../../components/TapeLine'
import ActionCenter from '../../components/ActionCenter'
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
import TransactionProgress, { type TransactionStage } from '../../components/TransactionProgress'
import { transactionErrorMessage } from '../../lib/transactionErrors'

export default function MePage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const protocolAddress = getPactAddress(chainId)
  const { setOpen: openModal } = useModal()

  const [pacts, setPacts] = useState<PactData[]>([])
  const [reputation, setReputation] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)
  const [credits, setCredits] = useState<Record<string, bigint>>({})
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MAKER' | 'TAKER'>('ALL')
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStage, setTxStage] = useState<TransactionStage>('idle')
  const [txLabel, setTxLabel] = useState('')
  const [txError, setTxError] = useState('')

  useEffect(() => {
    document.title = 'PACT · Portfolio & Account'
  }, [])

  const loadUserData = useCallback(async (cursor: string | null = null, mode: 'replace' | 'refresh' | 'append' = 'refresh') => {
    if (!address) {
      setLoading(false)
      return
    }
    try {
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
    } finally {
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
    if (!address) return []
    return pacts.filter(p => {
      if (roleFilter === 'MAKER') return p.maker.toLowerCase() === address.toLowerCase()
      if (roleFilter === 'TAKER') return p.taker.toLowerCase() === address.toLowerCase()
      return true
    })
  }, [pacts, roleFilter, address])

  const makerCount = useMemo(() => pacts.filter(p => address && p.maker.toLowerCase() === address.toLowerCase()).length, [pacts, address])
  const takerCount = useMemo(() => pacts.filter(p => address && p.taker.toLowerCase() === address.toLowerCase()).length, [pacts, address])

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
                <span>Track locked maker & counterparty collateral</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                <span>Action Center alerts for expiring deadlines</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                <span>One-click collateral release & settlement</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary-fixed">✓</span>
                <span>Withdraw pull-payment credit balances</span>
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
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-hairline pb-5 animate-enter">
        <div>
          <p className="pact-eyebrow mb-1">Account & Escrow Dashboard</p>
          <h1 className="font-display-mono text-[24px] sm:text-[30px] font-bold text-white tracking-tight">
            Portfolio
          </h1>
          <p className="mt-1 font-body-sans text-[13px] text-text-muted max-w-xl">
            Live commitments, counterparty records, and on-chain settlement track record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/new"
            className="pact-button-primary px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
            New Pact
          </Link>
        </div>
      </header>

      {/* Account Identity & Reputation Card */}
      <section aria-label="Connected Account Overview" className="border border-outline-border bg-[#0c0f12] p-5 animate-enter">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-hairline">
          <div>
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block mb-1">
              Connected Account
            </span>
            <div className="flex items-center gap-2 flex-wrap font-code-hash">
              <span className="text-[14px] font-bold text-white">
                {truncateAddress(address || '')}
              </span>
              <button
                type="button"
                onClick={copyAddress}
                className="px-2 py-0.5 border border-outline-border bg-[#12161b] text-[10px] font-label-caps uppercase tracking-wider text-text-muted hover:text-white hover:border-outline-variant transition-colors"
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

          <div className="flex items-center gap-2 text-[11px] font-code-hash text-text-dim">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Arc Testnet 5042002</span>
          </div>
        </div>

        {/* 4 Scorecards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-outline-hairline border border-outline-hairline mt-4">
          <div className="p-4 bg-[#07080a]">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
              Cleared Deals
            </span>
            <span className="font-display-mono text-[22px] font-bold text-emerald-400 mt-1 block tabular-nums">
              {reputation ? reputation.cleared : 0}
            </span>
          </div>

          <div className="p-4 bg-[#07080a]">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
              Slashed / Disputes Lost
            </span>
            <span className="font-display-mono text-[22px] font-bold text-rose-400 mt-1 block tabular-nums">
              {reputation ? reputation.slashed : 0}
            </span>
          </div>

          <div className="p-4 bg-[#07080a]">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
              Settled Notional
            </span>
            <span className="font-display-mono text-[22px] font-bold text-white mt-1 block tabular-nums">
              ${reputation ? formatAmount(reputation.notional) : '0.00'}
            </span>
          </div>

          <div className="p-4 bg-[#07080a]">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
              Reliability Score
            </span>
            <span className="font-display-mono text-[22px] font-bold text-primary-fixed mt-1 block tabular-nums">
              {successRate === null ? 'NO HISTORY' : `${successRate}%`}
            </span>
          </div>
        </div>
      </section>

      {/* Claimable Credits Banner (if any) */}
      {claimableCredits.length > 0 && (
        <section className="border border-emerald-500/40 bg-emerald-950/20 p-4 sm:p-5 animate-enter">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400 text-[18px]">account_balance_wallet</span>
                <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-emerald-300">
                  Claimable Escrow Credits
                </h2>
              </div>
              <p className="mt-1 text-[12px] text-text-muted font-body-sans">
                You have pull-payment credits ready for withdrawal to your wallet.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {claimableCredits.map(([tok, val]) => (
                <button
                  key={tok}
                  type="button"
                  disabled={Boolean(busyToken)}
                  onClick={() => withdrawCredits(tok as `0x${string}`)}
                  className="pact-button-primary min-h-[38px] px-3 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  Withdraw {formatAmount(val)} {tokenSymbol(tok)}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Action Center */}
      <ActionCenter pacts={pacts} address={address || ''} />

      {/* Role Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-enter">
        <div role="group" aria-label="Filter pacts by role" className="flex items-center gap-1.5 overflow-x-auto hide-scroll w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setRoleFilter('ALL')}
            aria-pressed={roleFilter === 'ALL'}
            className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
              roleFilter === 'ALL'
                ? 'border border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold'
                : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white'
            }`}
          >
            ALL PACTS ({pacts.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('MAKER')}
            aria-pressed={roleFilter === 'MAKER'}
            className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
              roleFilter === 'MAKER'
                ? 'border border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold'
                : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white'
            }`}
          >
            AS MAKER ({makerCount})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('TAKER')}
            aria-pressed={roleFilter === 'TAKER'}
            className={`px-3 py-1.5 font-label-caps text-[11px] uppercase tracking-wider transition-colors shrink-0 ${
              roleFilter === 'TAKER'
                ? 'border border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold'
                : 'border border-outline-border bg-[#0c0f12] text-text-muted hover:text-white'
            }`}
          >
            AS COUNTERPARTY ({takerCount})
          </button>
        </div>

        <span className="font-code-hash text-[11px] text-text-dim">
          Showing {filteredPacts.length} of {pacts.length} agreements
        </span>
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
            <div className="flex items-center justify-center py-20 text-[12px] text-text-muted gap-3 font-code-hash">
              <span className="w-2.5 h-2.5 bg-primary-fixed live-dot" />
              INDEXING ACCOUNT ON-CHAIN COMMITMENTS...
            </div>
          ) : filteredPacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center border border-outline-border bg-[#12161b] font-display-mono text-text-muted text-lg">
                Ø
              </div>
              <p className="font-display-mono text-[14px] font-bold uppercase tracking-wider text-white">
                No pact agreements found for this role filter
              </p>
              <p className="mt-1.5 max-w-sm font-body-sans text-[12px] leading-5 text-text-muted">
                Create a new agreement to lock maker collateral and send an offer to your designated counterparty.
              </p>
              <Link
                href="/new"
                className="pact-button-primary mt-5 px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
              >
                Create New Pact
              </Link>
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
