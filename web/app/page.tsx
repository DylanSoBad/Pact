'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ConnectButton from '../components/ConnectButton'
import TapeLine from '../components/TapeLine'
import { fetchPacts, PactData } from '../lib/reads'
import { kindLabel, statusLabel, formatAmount, tokenSymbol, formatTimestamp, truncateAddress, statusColor, isZeroAddress } from '../lib/format'

export default function TapePage() {
  const [pacts, setPacts] = useState<PactData[]>([])
  const [filter, setFilter] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function poll() {
      try {
        const data = await fetchPacts(50)
        if (mounted) {
          setPacts(data)
          setLoading(false)
        }
      } catch {
        if (mounted) setLoading(false)
      }
    }

    poll()
    const interval = setInterval(poll, 2000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const filteredPacts = pacts.filter((p) => {
    if (filter === 'ALL') return true
    if (filter === 'LIVE') return p.status === 2 // Active
    return kindLabel(p.kind) === filter
  })

  const filters = ['ALL', 'DELIVERY', 'FX', 'JOB', 'LIVE']

  return (
    <main className="min-h-screen max-w-[960px] mx-auto pt-8 flex flex-col">
      <header className="flex justify-between items-center mb-4 px-4">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight">PACT</h1>
            <div className="bg-[var(--color-panel)] px-3 py-1 text-xs font-mono border border-[var(--color-line)] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--color-lime)] animate-pulse"></div>
              ARC TESTNET 5042002
            </div>
          </div>
          <p className="text-[var(--color-muted)] text-sm mt-1">economic contracts with collateral. not a dex.</p>
        </div>
        <ConnectButton />
      </header>

      <div className="flex gap-4 mb-6 px-4 items-center">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-mono uppercase pb-1 transition-colors cursor-pointer ${
              filter === f
                ? 'text-[var(--color-lime)] border-b border-[var(--color-lime)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
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
