'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import TapeLine from '../components/TapeLine'
import ConnectButton from '../components/ConnectButton'
import { fetchPacts, PactData } from '../lib/reads'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol,
  formatTimestamp, truncateAddress
} from '../lib/format'

export default function Home() {
  const [filter, setFilter] = useState('ALL')
  const [pacts, setPacts] = useState<PactData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      const data = await fetchPacts()
      if (mounted) {
        // Sort descending by ID so newest is at top
        setPacts(data.sort((a, b) => Number(b.id) - Number(a.id)))
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 2000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const filteredPacts = pacts.filter(p => {
    if (filter === 'ALL') return true
    if (filter === 'LIVE') return p.status === 2 // Status.LIVE
    if (filter === 'DELIVERY') return p.kind === 0
    if (filter === 'FX') return p.kind === 1
    if (filter === 'JOB') return p.kind === 2
    return true
  })

  return (
    <main className="min-h-screen max-w-[800px] mx-auto pt-8 px-4 flex flex-col">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-4 h-4 bg-[var(--color-lime)]"></div>
          <h1 className="text-xl font-bold tracking-tight font-mono">PACT // ARC</h1>
        </div>
        <ConnectButton />
      </header>

      <div className="flex border-b border-[var(--color-line)] text-sm font-mono sticky top-0 bg-black z-10">
        {['ALL', 'DELIVERY', 'FX', 'JOB', 'LIVE'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-6 py-1 ${filter === f ? 'bg-white text-black' : 'text-[var(--color-muted)] hover:text-white'}`}
          >
            {f}
          </button>
        ))}
        <div className="flex-1"></div>
        <Link
          href="/new"
          className="bg-[var(--color-lime)] text-black px-6 py-1 text-sm font-bold font-mono hover:brightness-90 transition-all inline-block"
        >
          NEW PACT
        </Link>
      </div>

      <div className="flex-1 bg-black border border-[var(--color-line)] flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--color-muted)] font-mono text-sm">
            <div className="w-3 h-3 border border-[var(--color-lime)] border-t-transparent rounded-full animate-spin mr-3"></div>
            loading tape…
          </div>
        ) : filteredPacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)] font-mono">
            <p className="text-lg mb-2">no prints yet</p>
            <p className="text-xs">create the first pact →</p>
          </div>
        ) : (
          filteredPacts.map((p) => {
            const amountDisplay = p.kind === 1
              ? `$${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)} ↔ $${formatAmount(p.amountTaker)} ${tokenSymbol(p.tokenTaker)}`
              : `$${formatAmount(p.amountMaker)} ${tokenSymbol(p.tokenMaker)}`

            return (
              <TapeLine
                key={p.id}
                pact={{
                  id: p.id,
                  time: formatTimestamp(p.updatedAt),
                  kind: kindLabel(p.kind),
                  status: p.status === 2 ? 'LIVE' : statusLabel(p.status),
                  amount: amountDisplay,
                  address: truncateAddress(p.maker),
                  blurSize: p.blurSize,
                }}
              />
            )
          })
        )}
      </div>
    </main>
  )
}
