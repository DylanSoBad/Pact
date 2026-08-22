'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
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

  useEffect(() => { document.title = 'PACT · My Profile' }, [])

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
      <div className="w-full max-w-terminal mx-auto font-mono">
        <div className="text-center py-20 space-y-4 animate-enter border border-zinc-800 bg-[#0c0d10] px-4">
          <h1 className="text-[20px] font-bold text-white uppercase tracking-widest">Connect Wallet</h1>
          <p className="text-[12px] text-zinc-500 max-w-[24rem] mx-auto uppercase tracking-wider">
            Connect your Arc wallet to view your on-chain settlement reputation, active pact commitments, and transaction history.
          </p>
          <button onClick={() => openModal(true)} className="btn-primary px-6 py-2.5 text-[12px] uppercase tracking-widest">
            Connect Wallet
          </button>
          <a href="#reputation-system" className="block text-[11px] text-primary-fixed underline">What is this?</a>
          <div className="mt-8 max-w-2xl mx-auto text-left opacity-45 blur-[1px] pointer-events-none select-none border border-zinc-800 bg-black p-4 space-y-3" aria-hidden="true">
            <div className="flex justify-between text-[11px] text-zinc-500 uppercase"><span>Reputation score</span><span className="text-[#c8f542]">92%</span></div>
            <div className="grid grid-cols-3 gap-2"><div className="h-14 border border-zinc-800 bg-zinc-950 p-2 text-[10px] text-zinc-500">Cleared<br /><b className="text-[#c8f542] text-lg">12</b></div><div className="h-14 border border-zinc-800 bg-zinc-950 p-2 text-[10px] text-zinc-500">Active<br /><b className="text-white text-lg">3</b></div><div className="h-14 border border-zinc-800 bg-zinc-950 p-2 text-[10px] text-zinc-500">History<br /><b className="text-white text-lg">18</b></div></div>
            <div className="h-10 border border-zinc-800 bg-zinc-950 text-[10px] text-zinc-500 p-3">PACT #0042 · ACTIVE · 250 USDC</div>
          </div>
          <p id="reputation-system" className="max-w-[28rem] mx-auto text-[11px] leading-relaxed text-zinc-500">Your profile shows on-chain pact history, completed settlements, and outcomes. Connect a wallet to load your real record.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-terminal mx-auto font-mono">
      {/* Profile Header */}
      <div className="surface-1 rounded-none p-4 @md:p-6 mb-6 @md:mb-8 border border-zinc-800 space-y-4 animate-enter">
        <div className="flex flex-col @sm:flex-row @sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-widest text-zinc-500 block mb-1">Connected Account</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-white uppercase">
                {truncateAddress(address || '')}
              </span>
              <button
                onClick={copyAddress}
                className="btn-ghost px-2.5 py-1 text-[11px] text-zinc-500 hover:text-[#c8f542] uppercase tracking-widest"
              >
                {copiedAddr ? 'Copied' : 'Copy'}
              </button>
              <a
                href={`https://testnet.arcscan.app/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] uppercase tracking-widest text-zinc-500 hover:text-[#c8f542] underline ml-1"
              >
                ArcScan ↗
              </a>
            </div>
          </div>

          <Link href="/new" className="btn-primary px-4 py-2 text-[12px] uppercase tracking-widest text-center shrink-0">
            NEW PACT
          </Link>
        </div>

        {/* Reputation Scorecards */}
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2.5 @md:gap-3 pt-4 border-t border-zinc-800 mt-4">
          <div className="p-3 rounded-none bg-black border border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Cleared Deals</span>
            <span className="text-[18px] font-bold text-[#c8f542] mt-0.5 tabular-nums block">
              {reputation ? reputation.cleared : 0}
            </span>
          </div>

          <div className="p-3 rounded-none bg-black border border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Slashed / Disputes</span>
            <span className="text-[18px] font-bold text-rose-400 mt-0.5 tabular-nums block">
              {reputation ? reputation.slashed : 0}
            </span>
          </div>

          <div className="p-3 rounded-none bg-black border border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Settled Notional</span>
            <span className="text-[18px] font-bold text-zinc-400 mt-0.5 tabular-nums block">
              ${reputation ? formatAmount(reputation.notional) : '0.00'}
            </span>
          </div>

          <div className="p-3 rounded-none bg-black border border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Reliability Score</span>
            <span className="text-[18px] font-bold text-[#c8f542] mt-0.5 tabular-nums block">
              {successRate}%
            </span>
          </div>
        </div>
      </div>

      {/* Role Filters */}
      <div className="flex items-center justify-between gap-3 mb-6 animate-enter-delay overflow-x-auto hide-scroll">
        <div className="flex items-center gap-1.5 border border-zinc-800 bg-[#0c0d10] p-1 shrink-0">
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`px-3 py-1.5 text-[11px] uppercase tracking-widest transition-none ${
              roleFilter === 'ALL'
                ? 'bg-[#c8f542] text-black font-bold'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            ALL PACTS ({pacts.length})
          </button>
          <button
            onClick={() => setRoleFilter('MAKER')}
            className={`px-3 py-1.5 text-[11px] uppercase tracking-widest transition-none ${
              roleFilter === 'MAKER'
                ? 'bg-[#c8f542] text-black font-bold'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            AS MAKER ({makerCount})
          </button>
          <button
            onClick={() => setRoleFilter('TAKER')}
            className={`px-3 py-1.5 text-[11px] uppercase tracking-widest transition-none ${
              roleFilter === 'TAKER'
                ? 'bg-[#c8f542] text-black font-bold'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            AS COUNTERPARTY ({takerCount})
          </button>
        </div>
      </div>

      {/* Pacts List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[12px] text-zinc-500 gap-3">
          <div className="w-3 h-3 bg-[#c8f542] animate-pulse-soft" />
          FETCHING ON-CHAIN RECORDS...
        </div>
      ) : filteredPacts.length === 0 ? (
        <div className="text-center py-16 surface-1 rounded-none border border-zinc-800 p-8 space-y-3 bg-[#0c0d10]">
          <p className="text-[12px] text-zinc-500 uppercase tracking-widest">No pact contracts found for this account.</p>
          <Link href="/new" className="text-[#c8f542] inline-block px-5 py-2 text-[12px] uppercase tracking-widest underline">
            CREATE NEW PACT
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
                status: p.status === 2 ? 'ACTIVE' : p.status === 3 ? 'PROOF IN' : statusLabel(p.status),
                amount: amt,
                address: truncateAddress(p.maker),
                blurSize: false,
              }} />
            )
          })}
        </div>
      )}
    </div>
  )
}
