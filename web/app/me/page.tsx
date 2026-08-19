'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '../../components/Navbar'
import TrustStrip from '../../components/TrustStrip'
import TapeLine from '../../components/TapeLine'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { fetchPacts, fetchReputation, PactData } from '../../lib/reads'
import { getPactAddress } from '../../lib/arc'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../../lib/format'

export default function MePage() {
  const { address, isConnected } = useAccount()
  const { setOpen: openModal } = useModal()

  const [pacts, setPacts] = useState<PactData[]>([])
  const [reputation, setReputation] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MAKER' | 'TAKER'>('ALL')
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now())
  const [rpcError, setRpcError] = useState(false)

  useEffect(() => { document.title = 'PACT · My Portfolio & Reputation' }, [])

  async function loadUserData() {
    if (!address) {
      setLoading(false)
      return
    }
    try {
      const contractAddress = getPactAddress()
      const [allPacts, rep] = await Promise.all([
        fetchPacts(100, contractAddress),
        fetchReputation(address as `0x${string}`, contractAddress)
      ])

      const userPacts = allPacts.filter(
        p => p.maker.toLowerCase() === address.toLowerCase() || p.taker.toLowerCase() === address.toLowerCase()
      )

      setPacts(userPacts)
      setReputation(rep)
      setRpcError(false)
      setLastFetchTime(Date.now())
    } catch (err) {
      console.error('Error loading /me data:', err)
      setRpcError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ok = true
    loadUserData()
    const iv = setInterval(() => { if (ok && !document.hidden && address) loadUserData() }, 3000)
    const vis = () => { if (!document.hidden && address) loadUserData() }
    document.addEventListener('visibilitychange', vis)
    return () => { ok = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [address])

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

  const successRate = reputation && (reputation.cleared + reputation.slashed > 0)
    ? ((reputation.cleared / (reputation.cleared + reputation.slashed)) * 100).toFixed(0)
    : '100'

  if (!isConnected) {
    return (
      <main className="min-h-screen max-w-[780px] mx-auto px-5 sm:px-8 pb-24 overflow-x-hidden">
        <Navbar />
        <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={loadUserData} />

        <div className="text-center py-24 space-y-4 animate-enter">
          <h1 className="text-[22px] font-semibold text-white">Connect Wallet</h1>
          <p className="text-[14px] text-zinc-400 max-w-sm mx-auto">
            Connect your Arc wallet to view your on-chain settlement reputation, active escrow commitments, and transaction history.
          </p>
          <button onClick={() => openModal(true)} className="btn-primary px-6 py-2.5 text-[13px]">
            Connect Wallet
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-[780px] mx-auto px-5 sm:px-8 pb-24 overflow-x-hidden">
      <Navbar />
      <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={loadUserData} />

      {/* Profile Header */}
      <div className="surface-1 rounded-2xl p-6 mb-8 border border-white/[0.06] space-y-4 animate-enter">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[12px] text-zinc-500 block mb-1">Connected Account</span>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-mono text-white font-semibold">
                {truncateAddress(address || '')}
              </span>
              <button
                onClick={copyAddress}
                className="btn-ghost px-2.5 py-1 text-[11px] text-zinc-400 hover:text-white"
              >
                {copiedAddr ? 'Copied' : 'Copy'}
              </button>
              <a
                href={`https://testnet.arcscan.app/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-emerald-400 hover:text-emerald-300 underline ml-1"
              >
                ArcScan ↗
              </a>
            </div>
          </div>

          <Link href="/new" className="btn-primary px-4 py-2 text-[13px] text-center">
            New Pact +
          </Link>
        </div>

        {/* Reputation Scorecards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-emerald-500/20">
            <span className="text-[11px] text-emerald-300 block">Cleared Deals</span>
            <span className="text-[18px] font-bold text-emerald-400 mt-0.5 tabular-nums block">
              {reputation ? reputation.cleared : 0}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-rose-500/20">
            <span className="text-[11px] text-rose-300 block">Slashed / Disputes</span>
            <span className="text-[18px] font-bold text-rose-400 mt-0.5 tabular-nums block">
              {reputation ? reputation.slashed : 0}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-sky-500/20">
            <span className="text-[11px] text-sky-300 block">Settled Notional</span>
            <span className="text-[18px] font-bold text-sky-400 mt-0.5 tabular-nums font-mono block">
              ${reputation ? formatAmount(reputation.notional) : '0.00'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-amber-500/20">
            <span className="text-[11px] text-amber-300 block">Reliability Score</span>
            <span className="text-[18px] font-bold text-amber-400 mt-0.5 tabular-nums block">
              {successRate}%
            </span>
          </div>
        </div>
      </div>

      {/* Role Filters */}
      <div className="flex items-center justify-between gap-3 mb-6 animate-enter-delay">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`pill-interactive px-3.5 py-1.5 text-[13px] rounded-lg transition-all ${
              roleFilter === 'ALL'
                ? 'bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            All Pacts ({pacts.length})
          </button>
          <button
            onClick={() => setRoleFilter('MAKER')}
            className={`pill-interactive px-3.5 py-1.5 text-[13px] rounded-lg transition-all ${
              roleFilter === 'MAKER'
                ? 'bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            As Maker ({makerCount})
          </button>
          <button
            onClick={() => setRoleFilter('TAKER')}
            className={`pill-interactive px-3.5 py-1.5 text-[13px] rounded-lg transition-all ${
              roleFilter === 'TAKER'
                ? 'bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            As Counterparty ({takerCount})
          </button>
        </div>
      </div>

      {/* Pacts List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[14px] text-zinc-600 gap-3">
          <div className="w-4 h-4 border-[1.5px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Fetching your on-chain escrow records…
        </div>
      ) : filteredPacts.length === 0 ? (
        <div className="text-center py-16 surface-1 rounded-2xl border border-white/[0.04] p-8 space-y-3">
          <p className="text-[14px] text-zinc-400">No escrow contracts found for this account.</p>
          <Link href="/new" className="btn-primary inline-block px-5 py-2 text-[13px]">
            Create a New Escrow Pact →
          </Link>
        </div>
      ) : (
        <div className="space-y-2 animate-enter-delay">
          {filteredPacts.map(p => {
            const amt = p.kind === 1
              ? `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ ${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
              : `${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`
            return (
              <TapeLine key={p.id} pact={{
                id: p.id,
                time: formatTimestamp(p.updatedAt),
                kind: kindLabel(p.kind),
                status: p.status === 2 ? 'ACTIVE' : p.status === 3 ? 'PROOF IN' : p.status === 8 ? 'DISPUTED' : statusLabel(p.status),
                amount: amt,
                address: truncateAddress(p.maker),
                blurSize: false,
              }} />
            )
          })}
        </div>
      )}
    </main>
  )
}
