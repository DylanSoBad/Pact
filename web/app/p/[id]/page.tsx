'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { fetchSinglePact, fetchReputation, PactData } from '../../../lib/reads'
import { PACT_ABI, ERC20_ABI } from '../../../lib/abi'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol, formatDate,
  truncateAddress, isTerminal, isZeroAddress
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
  const [copiedHash, setCopiedHash] = useState(false)

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
      writeContract({
        address: pact.tokenTaker as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PACT_ADDRESS, pact.amountTaker],
      })
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

  const handleCopyHash = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  if (loading) {
    return (
      <main className="min-h-screen max-w-[680px] mx-auto pt-20 px-4 text-center">
        <div className="flex items-center justify-center gap-3 text-xs font-mono text-zinc-400">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Retrieving pact #{id} state from ledger…</span>
        </div>
      </main>
    )
  }

  if (!pact) {
    return (
      <main className="min-h-screen max-w-[680px] mx-auto pt-20 px-4 text-center">
        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto mb-3 font-mono text-sm">
          Ø
        </div>
        <h2 className="text-sm font-medium text-zinc-300 mb-1">Pact #{id} Not Found</h2>
        <p className="text-xs text-zinc-500 mb-4">No contract matching this identifier exists on Arc Testnet.</p>
        <Link href="/" className="text-xs font-mono text-emerald-400 hover:underline">
          ← Return to Dashboard
        </Link>
      </main>
    )
  }

  const displayStatus = pact.status === 2 ? 'LIVE' : statusLabel(pact.status)

  const getStatusBadge = () => {
    switch (pact.status) {
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            LIVE ESCROW
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            CLEARED
          </span>
        );
      case 5:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            SLASHED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700/60">
            {displayStatus}
          </span>
        );
    }
  }

  return (
    <main className="min-h-screen max-w-[680px] mx-auto pt-8 px-4 sm:px-6 pb-20">
      {/* Top Breadcrumb & Heading */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1c1d22]">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors mb-2">
            ← Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold tracking-tight text-zinc-100">
              Pact #{id.toString().padStart(4, '0')}
            </h1>
            <span className="text-xs font-mono text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">
              {kindLabel(pact.kind)}
            </span>
          </div>
        </div>
        <div>
          {getStatusBadge()}
        </div>
      </div>

      {/* Terms Verification Notification */}
      {termsVerified !== null && (
        <div className={`mb-6 p-3.5 rounded-md text-xs font-mono flex items-center justify-between border ${
          termsVerified
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            <span>{termsVerified ? '✓' : '⚠️'}</span>
            <span>{termsVerified ? 'Terms text exactly matches on-chain cryptographic hash.' : 'Terms text does NOT match on-chain hash — Verify before interacting.'}</span>
          </div>
        </div>
      )}

      {/* Main Contract Specs Grid */}
      <div className="bg-[#111215] border border-[#1e1f25] rounded-md overflow-hidden mb-6 shadow-sm divide-y divide-[#1c1d22]">
        <DetailRow label="Contract Archetype" value={kindLabel(pact.kind)} />
        <DetailRow
          label="Maker (Initiator)"
          value={truncateAddress(pact.maker)}
          mono
          highlight={isMaker ? '(You)' : undefined}
        />
        <DetailRow
          label="Taker (Counterparty)"
          value={isZeroAddress(pact.taker) ? 'Open Public Counterparty' : truncateAddress(pact.taker)}
          mono
          highlight={isTaker ? '(You)' : undefined}
        />
        <DetailRow
          label="Maker Locked Principal"
          value={pact.blurSize ? 'SIZE OBFUSCATED ON UI' : `$${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}`}
          muted={pact.blurSize}
        />
        {pact.amountTaker > 0n && (
          <DetailRow
            label={pact.kind === 1 ? 'Taker Required Lock' : 'Taker Collateral Bond'}
            value={pact.blurSize ? 'SIZE OBFUSCATED ON UI' : `$${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}`}
            muted={pact.blurSize}
          />
        )}
        <DetailRow label="Creation Timestamp" value={formatDate(pact.createdAt)} />
        <div className="flex justify-between items-center py-3 px-4 text-xs font-mono">
          <span className="text-zinc-400 uppercase text-[11px] tracking-wider">Settlement Deadline</span>
          <span className={`${deadlinePassed ? 'text-rose-400' : 'text-zinc-200'}`}>
            {formatDate(pact.deadline)}{' '}
            {!isTerminal(pact.status) && (
              <span className="text-emerald-400 ml-1.5">
                (<Countdown deadlineTs={pact.deadline} />)
              </span>
            )}
          </span>
        </div>
        <DetailRow label="Last Updated" value={formatDate(pact.updatedAt)} />
      </div>

      {/* Cryptographic Hashes Card */}
      <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4 mb-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1c1d22]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
            Cryptographic Integrity Hashes
          </span>
          <button
            onClick={() => handleCopyHash(pact.termsHash)}
            className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {copiedHash ? '✓ Copied' : 'Copy Hash'}
          </button>
        </div>
        <div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">Terms SHA-256 Hash</span>
          <div className="bg-[#0c0d10] border border-[#1c1d22] p-2 rounded text-[11px] font-mono text-zinc-300 break-all select-all">
            {pact.termsHash}
          </div>
        </div>
        {pact.proofHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
          <div>
            <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">Fulfillment Proof Hash</span>
            <div className="bg-[#0c0d10] border border-[#1c1d22] p-2 rounded text-[11px] font-mono text-emerald-400 break-all select-all">
              {pact.proofHash}
            </div>
          </div>
        )}
      </div>

      {/* Maker Reputation Card */}
      {makerRep && (
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1c1d22]">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Maker On-Chain Reputation</span>
            <span className="text-[11px] font-mono text-zinc-500">Tracked by Protocol</span>
          </div>
          <div className="grid grid-cols-3 gap-3 font-mono text-xs text-center">
            <div className="bg-[#0e0f12] border border-[#1c1d22] p-2.5 rounded">
              <span className="text-zinc-500 text-[10px] block uppercase">Cleared Pacts</span>
              <span className="text-emerald-400 font-semibold text-sm">{makerRep.cleared}</span>
            </div>
            <div className="bg-[#0e0f12] border border-[#1c1d22] p-2.5 rounded">
              <span className="text-zinc-500 text-[10px] block uppercase">Slashed / Default</span>
              <span className="text-rose-400 font-semibold text-sm">{makerRep.slashed}</span>
            </div>
            <div className="bg-[#0e0f12] border border-[#1c1d22] p-2.5 rounded">
              <span className="text-zinc-500 text-[10px] block uppercase">Settled Volume</span>
              <span className="text-zinc-200 font-semibold text-sm">${formatAmount(makerRep.notional)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Pending TX Notice */}
      {txPending && (
        <div className="mb-6 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Confirming transaction on Arc Testnet...</span>
        </div>
      )}

      {/* Contract Lifecycle Actions */}
      {isConnected && !isTerminal(pact.status) && (
        <div className="space-y-3 pt-2">
          {canFund && (
            <button
              onClick={handleFund}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
            >
              {pact.amountTaker > 0n
                ? `Deposit & Fund ($${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)} Collateral)`
                : 'Accept & Fund Escrow (No Bond Required)'}
            </button>
          )}

          {canCancel && (
            <button
              onClick={handleCancel}
              className="w-full bg-[#16171c] hover:bg-[#202127] border border-[#27282f] hover:border-zinc-500 text-zinc-300 py-3 rounded-md font-mono text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel Pact (Reclaim Funds)
            </button>
          )}

          {canSubmitProof && (
            <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4 space-y-3">
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                Submit Fulfillment Proof URL or Reference
              </label>
              <input
                type="text"
                value={proofInput}
                onChange={(e) => setProofInput(e.target.value)}
                placeholder="e.g. https://github.com/pull/123 or Courier Tracking #849204"
                className="w-full bg-[#0d0e11] border border-[#222328] hover:border-[#32343c] text-zinc-100 px-3 py-2 rounded-md font-mono text-xs focus:border-emerald-500 transition-colors"
              />
              <button
                onClick={handleSubmitProof}
                disabled={!proofInput}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black py-2.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Submit Cryptographic Proof
              </button>
            </div>
          )}

          {canReject && (
            <button
              onClick={handleReject}
              className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 py-3 rounded-md font-mono text-xs font-semibold transition-colors cursor-pointer"
            >
              Reject Submitted Proof
            </button>
          )}

          {canRelease && (
            <button
              onClick={handleRelease}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
            >
              Release Escrow & Settle Funds
            </button>
          )}

          {canExpire && (
            <button
              onClick={handleExpire}
              className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 py-3 rounded-md font-mono text-xs font-semibold transition-colors cursor-pointer"
            >
              Trigger Expiry Resolution
            </button>
          )}
        </div>
      )}
    </main>
  )
}

function DetailRow({ label, value, mono, small, highlight, muted }: {
  label: string
  value: string
  mono?: boolean
  small?: boolean
  highlight?: string
  muted?: boolean
}) {
  return (
    <div className="flex justify-between items-center py-3 px-4 text-xs font-mono">
      <span className="text-zinc-400 uppercase text-[11px] tracking-wider">{label}</span>
      <span className={`${mono ? 'font-mono' : 'font-sans'} ${small ? 'text-[11px]' : ''} ${muted ? 'text-zinc-500 italic' : 'text-zinc-200'}`}>
        {value}
        {highlight && <span className="text-emerald-400 ml-1.5 font-semibold">{highlight}</span>}
      </span>
    </div>
  )
}
