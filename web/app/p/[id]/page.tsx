'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { fetchSinglePact, fetchReputation, PactData } from '../../../lib/reads'
import { PACT_ABI, ERC20_ABI } from '../../../lib/abi'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol, formatDate,
  truncateAddress, statusColor, isTerminal, isZeroAddress
} from '../../../lib/format'
import { verifyTerms } from '../../../lib/terms'
import Countdown from '../../../components/Countdown'

const PACT_ADDRESS = process.env.NEXT_PUBLIC_PACT_ADDRESS as `0x${string}`

export default function PactDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = Number(params.id)
  const termsParam = searchParams.get('terms')

  const { address, isConnected } = useAccount()
  const [pact, setPact] = useState<PactData | null>(null)
  const [loading, setLoading] = useState(true)
  const [proofInput, setProofInput] = useState('')
  const [termsVerified, setTermsVerified] = useState<boolean | null>(null)
  const [makerRep, setMakerRep] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)

  const { writeContract, data: txHash } = useWriteContract()
  const { isSuccess: txConfirmed, isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    let mounted = true

    async function load() {
      const data = await fetchSinglePact(id)
      if (mounted) {
        setPact(data)
        setLoading(false)

        if (data && termsParam) {
          setTermsVerified(verifyTerms(termsParam, data.termsHash as `0x${string}`))
        }

        if (data) {
          const rep = await fetchReputation(data.maker as `0x${string}`)
          if (mounted) setMakerRep(rep)
        }
      }
    }

    load()
    const interval = setInterval(load, 3000)
    return () => { mounted = false; clearInterval(interval) }
  }, [id, termsParam])

  // Reload after tx confirmed
  useEffect(() => {
    if (txConfirmed) {
      fetchSinglePact(id).then(setPact)
    }
  }, [txConfirmed, id])

  const isMaker = address && pact && pact.maker.toLowerCase() === address.toLowerCase()
  const isTaker = address && pact && pact.taker.toLowerCase() === address.toLowerCase()
  const isOpenTaker = pact && isZeroAddress(pact.taker)
  const canFund = pact && pact.status === 0 && !isMaker && (isOpenTaker || isTaker)
  const canCancel = pact && pact.status === 0 && isMaker
  const canSubmitProof = pact && pact.status === 2 && isTaker && pact.kind !== 1
  const canReject = pact && pact.status === 3 && isMaker && pact.kind !== 1
  const canRelease = pact && (
    (pact.kind === 1 && pact.status === 2 && (isMaker || isTaker)) ||
    (pact.kind !== 1 && (pact.status === 2 || pact.status === 3) && isMaker)
  )
  const deadlinePassed = pact && Number(pact.deadline) < Math.floor(Date.now() / 1000)
  const canExpire = pact && deadlinePassed && !isTerminal(pact.status) && (pact.status === 0 || pact.status === 2 || pact.status === 3)

  function handleFund() {
    if (!pact) return
    if (pact.amountTaker > 0n) {
      // Need to approve taker token first, then fund
      writeContract({
        address: pact.tokenTaker as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PACT_ADDRESS, pact.amountTaker],
      })
      // Note: in production, we'd chain approve → fund. For now just approve, then user clicks Fund again.
    }
    writeContract({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'fund',
      args: [BigInt(id)],
    })
  }

  function handleCancel() {
    writeContract({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'cancel',
      args: [BigInt(id)],
    })
  }

  function handleSubmitProof() {
    if (!proofInput) return
    const encoder = new TextEncoder()
    const bytes = encoder.encode(proofInput)
    // Simple keccak via viem would be better but we'll pass the raw hash
    import('viem').then(({ keccak256, toHex }) => {
      const hash = keccak256(toHex(bytes))
      writeContract({
        address: PACT_ADDRESS,
        abi: PACT_ABI,
        functionName: 'submitProof',
        args: [BigInt(id), hash],
      })
    })
  }

  function handleReject() {
    writeContract({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'reject',
      args: [BigInt(id)],
    })
  }

  function handleRelease() {
    writeContract({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'release',
      args: [BigInt(id)],
    })
  }

  function handleExpire() {
    writeContract({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'expire',
      args: [BigInt(id)],
    })
  }

  if (loading) {
    return (
      <main className="min-h-screen max-w-[640px] mx-auto pt-16 px-4 text-center">
        <div className="text-[var(--color-muted)] font-mono text-sm flex items-center justify-center gap-3">
          <div className="w-3 h-3 border border-[var(--color-lime)] border-t-transparent rounded-full animate-spin"></div>
          loading pact #{id}…
        </div>
      </main>
    )
  }

  if (!pact) {
    return (
      <main className="min-h-screen max-w-[640px] mx-auto pt-16 px-4 text-center">
        <p className="text-[var(--color-muted)] font-mono">pact #{id} not found</p>
        <Link href="/" className="text-[var(--color-lime)] font-mono text-sm underline mt-4 inline-block">← TAPE</Link>
      </main>
    )
  }

  const displayStatus = pact.status === 2 ? 'LIVE' : statusLabel(pact.status)

  return (
    <main className="min-h-screen max-w-[640px] mx-auto pt-8 px-4 pb-16">
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-[var(--color-muted)] font-mono text-sm hover:text-[var(--color-text)] transition-colors">
          ← TAPE
        </Link>
        <h1 className="text-xl font-bold font-mono">PACT #{id}</h1>
        <span className={`font-mono font-bold text-sm ${statusColor(pact.status)} ${pact.status === 2 ? 'animate-pulse' : ''}`}>
          {displayStatus}
        </span>
      </div>

      {/* Terms Verification Banner */}
      {termsVerified !== null && (
        <div className={`mb-6 border px-4 py-3 font-mono text-sm ${
          termsVerified
            ? 'border-[var(--color-lime)] text-[var(--color-lime)] bg-[var(--color-lime)]/5'
            : 'border-[var(--color-red)] text-[var(--color-red)] bg-[var(--color-red)]/5'
        }`}>
          {termsVerified ? '✓ Terms match on-chain hash' : '✗ Terms DO NOT match on-chain hash — BEWARE'}
        </div>
      )}

      {/* Info Grid */}
      <div className="border border-[var(--color-line)] bg-[var(--color-panel)] divide-y divide-[var(--color-line)]">
        <Row label="Kind" value={kindLabel(pact.kind)} />
        <Row label="Maker" value={truncateAddress(pact.maker)} mono highlight={isMaker ? '(you)' : undefined} />
        <Row label="Taker" value={isZeroAddress(pact.taker) ? 'OPEN' : truncateAddress(pact.taker)} mono highlight={isTaker ? '(you)' : undefined} />
        <Row
          label="Maker Locks"
          value={pact.blurSize ? 'SIZE HIDDEN' : `$${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}`}
          muted={pact.blurSize}
        />
        {pact.amountTaker > 0n && (
          <Row
            label={pact.kind === 1 ? 'Taker Locks' : 'Taker Bond'}
            value={pact.blurSize ? 'SIZE HIDDEN' : `$${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}`}
            muted={pact.blurSize}
          />
        )}
        <Row label="Created" value={formatDate(pact.createdAt)} />
        <div className="flex justify-between items-center px-4 py-2.5">
          <span className="text-xs font-mono text-[var(--color-muted)] uppercase">Deadline</span>
          <span className={`text-sm font-mono ${deadlinePassed ? 'text-[var(--color-red)]' : ''}`}>
            {formatDate(pact.deadline)} {!isTerminal(pact.status) && <span className="ml-2 text-[var(--color-lime)]">(<Countdown deadlineTs={pact.deadline} />)</span>}
          </span>
        </div>
        <Row label="Last Update" value={formatDate(pact.updatedAt)} />
        <Row label="Terms Hash" value={pact.termsHash} mono small />
        {pact.proofHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
          <Row label="Proof Hash" value={pact.proofHash} mono small />
        )}
      </div>

      {/* Maker Reputation */}
      {makerRep && (
        <div className="mt-4 border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3">
          <div className="text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">Maker Reputation</div>
          <div className="flex gap-6 font-mono text-sm">
            <span className="text-[var(--color-lime)]">{makerRep.cleared} cleared</span>
            <span className="text-[var(--color-amber)]">{makerRep.slashed} slashed</span>
            <span className="text-[var(--color-muted)]">${formatAmount(makerRep.notional)} notional</span>
          </div>
        </div>
      )}

      {/* TX pending */}
      {txPending && (
        <div className="mt-4 border border-[var(--color-lime)] bg-[var(--color-lime)]/5 px-4 py-3 font-mono text-sm text-[var(--color-lime)] flex items-center gap-3">
          <div className="w-3 h-3 border border-[var(--color-lime)] border-t-transparent rounded-full animate-spin"></div>
          Transaction pending…
        </div>
      )}

      {/* Actions */}
      {isConnected && !isTerminal(pact.status) && (
        <div className="mt-6 space-y-3">
          {canFund && (
            <button onClick={handleFund} className="w-full bg-[var(--color-lime)] text-black py-3 font-bold font-mono hover:brightness-90 transition-all cursor-pointer">
              {pact.amountTaker > 0n ? `FUND (Lock ${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)})` : 'FUND (No Bond Required)'}
            </button>
          )}

          {canCancel && (
            <button onClick={handleCancel} className="w-full border border-[var(--color-muted)] text-[var(--color-muted)] py-3 font-mono hover:border-[var(--color-red)] hover:text-[var(--color-red)] transition-all cursor-pointer">
              CANCEL PACT
            </button>
          )}

          {canSubmitProof && (
            <div className="space-y-2">
              <input
                type="text"
                value={proofInput}
                onChange={(e) => setProofInput(e.target.value)}
                placeholder="Proof description or URL…"
                className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none"
              />
              <button onClick={handleSubmitProof} disabled={!proofInput} className="w-full bg-[var(--color-lime)] text-black py-3 font-bold font-mono hover:brightness-90 transition-all disabled:opacity-30 cursor-pointer">
                SUBMIT PROOF
              </button>
            </div>
          )}

          {canReject && (
            <button onClick={handleReject} className="w-full border border-[var(--color-amber)] text-[var(--color-amber)] py-3 font-mono hover:bg-[var(--color-amber)]/10 transition-all cursor-pointer">
              REJECT PROOF
            </button>
          )}

          {canRelease && (
            <button onClick={handleRelease} className="w-full bg-[var(--color-lime)] text-black py-3 font-bold font-mono hover:brightness-90 transition-all cursor-pointer">
              RELEASE / CLEAR
            </button>
          )}

          {canExpire && (
            <button onClick={handleExpire} className="w-full border border-[var(--color-red)] text-[var(--color-red)] py-3 font-mono hover:bg-[var(--color-red)]/10 transition-all cursor-pointer">
              EXPIRE PACT
            </button>
          )}
        </div>
      )}
    </main>
  )
}

function Row({ label, value, mono, small, highlight, muted, warn }: {
  label: string
  value: string
  mono?: boolean
  small?: boolean
  highlight?: string
  muted?: boolean
  warn?: boolean | null
}) {
  return (
    <div className="flex justify-between items-center px-4 py-2.5">
      <span className="text-xs font-mono text-[var(--color-muted)] uppercase">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''} ${small ? 'text-xs' : ''} ${muted ? 'text-[var(--color-muted)] italic' : ''} ${warn ? 'text-[var(--color-red)]' : ''}`}>
        {value}
        {highlight && <span className="text-[var(--color-lime)] ml-2 text-xs">{highlight}</span>}
      </span>
    </div>
  )
}
