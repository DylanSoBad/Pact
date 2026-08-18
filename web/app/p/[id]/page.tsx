'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '../../../components/Navbar'
import TrustStrip from '../../../components/TrustStrip'
import PactStateMachine from '../../../components/PactStateMachine'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { fetchSinglePact, fetchReputation, PactData } from '../../../lib/reads'
import { PACT_ABI, ERC20_ABI } from '../../../lib/abi'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol, formatDate,
  truncateAddress, isTerminal, isZeroAddress
} from '../../../lib/format'
import { verifyTerms } from '../../../lib/terms'
import Countdown from '../../../components/Countdown'

const PACT_ADDRESS = (process.env.NEXT_PUBLIC_PACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`

export default function PactDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = Number(params.id)
  const termsParam = searchParams.get('terms')

  const { address, isConnected } = useAccount()
  const [pact, setPact] = useState<PactData | null>(null)
  const [loading, setLoading] = useState(true)
  const [proofInput, setProofInput] = useState('')
  const [verifyInput, setVerifyInput] = useState(termsParam || '')
  const [termsVerified, setTermsVerified] = useState<boolean | null>(null)
  const [makerRep, setMakerRep] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)
  const [copiedShareLink, setCopiedShareLink] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now())
  const [rpcError, setRpcError] = useState(false)

  useEffect(() => { if (id) document.title = `PACT · #${id.toString().padStart(4, '0')}` }, [id])

  const { writeContract, data: txHash, isPending: txPending, error: writeError } = useWriteContract()
  const { isSuccess: txConfirmed, isLoading: txReceiptLoading } = useWaitForTransactionReceipt({ hash: txHash })

  async function load() {
    if (document.hidden) return
    try {
      const data = await fetchSinglePact(id)
      if (data) {
        setPact(data); setRpcError(false); setLastFetchTime(Date.now())
        if (termsParam) setTermsVerified(verifyTerms(termsParam, data.termsHash as `0x${string}`))
        const rep = await fetchReputation(data.maker as `0x${string}`)
        setMakerRep(rep)
      }
    } catch { setRpcError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let mounted = true; load()
    const interval = setInterval(() => { if (mounted && !document.hidden) load() }, 10000)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { mounted = false; clearInterval(interval); document.removeEventListener('visibilitychange', onVis) }
  }, [id, termsParam])

  useEffect(() => { if (txConfirmed) load() }, [txConfirmed])

  const isMaker = address && pact && pact.maker.toLowerCase() === address.toLowerCase()
  const isTaker = address && pact && !isZeroAddress(pact.taker) && pact.taker.toLowerCase() === address.toLowerCase()
  const isOpenTaker = pact && isZeroAddress(pact.taker) && !isMaker

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

  const doFund = () => {
    if (!pact) return
    if (pact.amountTaker > 0n) {
      writeContract({ address: pact.tokenTaker as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [PACT_ADDRESS, pact.amountTaker] })
    }
    writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'fund', args: [BigInt(id)] })
  }
  const doCancel = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'cancel', args: [BigInt(id)] })
  const doProof = () => {
    if (!proofInput) return
    const encoder = new TextEncoder()
    const bytes = encoder.encode(proofInput)
    import('viem').then(({ keccak256, toHex }) => {
      const hash = keccak256(toHex(bytes))
      writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'submitProof', args: [BigInt(id), hash] })
    })
  }
  const doReject = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'reject', args: [BigInt(id)] })
  const doRelease = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'release', args: [BigInt(id)] })
  const doExpire = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'expire', args: [BigInt(id)] })

  const copyShareLink = () => {
    navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : '')
    setCopiedShareLink(true); setTimeout(() => setCopiedShareLink(false), 2500)
  }

  if (loading) {
    return (
      <main className="min-h-screen max-w-[700px] mx-auto pt-6 sm:pt-8 px-4 sm:px-6 pb-20 overflow-x-hidden">
        <Navbar />
        <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={load} />
        <div className="flex flex-col items-center justify-center py-24 text-xs font-mono text-zinc-500 gap-3">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Loading pact #{id}…
        </div>
      </main>
    )
  }

  if (!pact) {
    return (
      <main className="min-h-screen max-w-[700px] mx-auto pt-6 sm:pt-8 px-4 sm:px-6 pb-20 overflow-x-hidden">
        <Navbar />
        <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={load} />
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center max-w-sm mx-auto">
          <p className="text-sm text-zinc-300 mb-1">Pact #{id} not found</p>
          <Link href="/" className="text-xs font-mono text-emerald-400 hover:underline">← Dashboard</Link>
        </div>
      </main>
    )
  }

  const roleText = isMaker ? 'Maker' : isTaker ? 'Taker' : isOpenTaker ? 'Candidate Taker' : 'Observer'
  const roleColor = isMaker ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
    (isTaker || isOpenTaker) ? 'text-amber-400 bg-amber-500/10 border-amber-500/25' :
    'text-zinc-400 bg-zinc-800/60 border-zinc-700/40'

  return (
    <main className="min-h-screen max-w-[700px] mx-auto pt-6 sm:pt-8 px-4 sm:px-6 pb-20 overflow-x-hidden">
      <Navbar />
      <TrustStrip lastUpdated={lastFetchTime} rpcError={rpcError} onRetry={load} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-zinc-800/50">
        <div>
          <Link href="/" className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors">← Back</Link>
          <div className="flex items-center gap-2.5 mt-1">
            <h1 className="text-base font-semibold text-zinc-100">Pact #{id.toString().padStart(4, '0')}</h1>
            <span className="text-[11px] font-mono text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/40">{kindLabel(pact.kind)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium border ${roleColor}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />{roleText}
          </span>
          <button onClick={copyShareLink}
            className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 bg-zinc-800/40 border border-zinc-700/40 px-2.5 py-1 rounded transition-colors cursor-pointer">
            {copiedShareLink ? '✓ Copied' : 'Share'}
          </button>
        </div>
      </div>

      {/* State machine */}
      <PactStateMachine status={pact.status} />

      {/* Terms verification */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Terms</span>
          {termsVerified === true && <span className="text-[10px] font-mono text-emerald-400">✓ Verified</span>}
          {termsVerified === false && <span className="text-[10px] font-mono text-rose-400">✗ Mismatch</span>}
        </div>
        {termsParam ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs text-zinc-300 leading-relaxed">
            &ldquo;{decodeURIComponent(termsParam)}&rdquo;
          </div>
        ) : (
          <div className="flex gap-2">
            <input type="text" value={verifyInput} onChange={e => setVerifyInput(e.target.value)}
              placeholder="Paste terms to verify…"
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 px-3 py-1.5 rounded text-xs font-mono placeholder:text-zinc-700 focus:border-emerald-500" />
            <button type="button" onClick={() => { if (pact && verifyInput) setTermsVerified(verifyTerms(verifyInput, pact.termsHash as `0x${string}`)) }}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded text-xs font-mono whitespace-nowrap cursor-pointer transition-colors">
              Verify
            </button>
          </div>
        )}
      </div>

      {/* Detail rows */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 overflow-hidden mb-5 divide-y divide-zinc-800/40">
        <Row label="Maker" value={truncateAddress(pact.maker)} link={`https://testnet.arcscan.app/address/${pact.maker}`} tag={isMaker ? 'You' : undefined} />
        <Row label="Taker" value={isZeroAddress(pact.taker) ? 'Open' : truncateAddress(pact.taker)}
          link={!isZeroAddress(pact.taker) ? `https://testnet.arcscan.app/address/${pact.taker}` : undefined} tag={isTaker ? 'You' : undefined} />
        <Row label="Locked" value={pact.blurSize ? 'Hidden' : `${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}`} muted={pact.blurSize} />
        {pact.amountTaker > 0n && (
          <Row label={pact.kind === 1 ? 'Counter lock' : 'Bond'} value={pact.blurSize ? 'Hidden' : `${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}`} muted={pact.blurSize} />
        )}
        <Row label="Created" value={formatDate(pact.createdAt)} />
        <div className="flex justify-between items-center py-2.5 px-4 text-xs font-mono">
          <span className="text-zinc-500">Deadline</span>
          <span className={deadlinePassed ? 'text-rose-400' : 'text-zinc-300'}>
            {formatDate(pact.deadline)}
            {!isTerminal(pact.status) && <span className="text-emerald-400 ml-1.5">(<Countdown deadlineTs={pact.deadline} />)</span>}
          </span>
        </div>
      </div>

      {/* Hashes */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 mb-5">
        <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block mb-2">Hashes</span>
        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-2 text-[11px] font-mono text-zinc-400 break-all select-all mb-2">
          <span className="text-zinc-600">terms: </span>{pact.termsHash}
        </div>
        {pact.proofHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-md p-2 text-[11px] font-mono text-emerald-400 break-all select-all">
            <span className="text-zinc-600">proof: </span>{pact.proofHash}
          </div>
        )}
      </div>

      {/* Maker reputation */}
      {makerRep && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-2.5 text-center">
            <span className="text-[10px] font-mono text-zinc-600 block uppercase">Cleared</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{makerRep.cleared}</span>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-2.5 text-center">
            <span className="text-[10px] font-mono text-zinc-600 block uppercase">Slashed</span>
            <span className="text-sm font-mono font-bold text-rose-400">{makerRep.slashed}</span>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-2.5 text-center">
            <span className="text-[10px] font-mono text-zinc-600 block uppercase">Volume</span>
            <span className="text-sm font-mono font-bold text-zinc-200">${formatAmount(makerRep.notional)}</span>
          </div>
        </div>
      )}

      {/* TX pending */}
      {(txPending || txReceiptLoading) && (
        <div className="mb-5 p-3 rounded-md bg-amber-500/8 border border-amber-500/25 text-amber-300 text-xs font-mono flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          Confirming on Arc Testnet…
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-amber-400 underline ml-auto">tx ↗</a>}
        </div>
      )}

      {/* Error */}
      {writeError && (
        <div className="mb-5 p-3 rounded-md bg-rose-500/8 border border-rose-500/25 text-rose-300 text-xs font-mono">
          {writeError.message || 'Transaction failed'}
        </div>
      )}

      {/* Actions */}
      {isConnected && !isTerminal(pact.status) && (
        <div className="space-y-3">
          {canFund && (
            <button onClick={doFund} disabled={txPending || txReceiptLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold transition-colors cursor-pointer disabled:opacity-50">
              {pact.amountTaker > 0n ? `Deposit & Fund (${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)})` : 'Accept & Fund'}
            </button>
          )}

          {isMaker && pact.status === 0 && (
            <p className="text-xs text-zinc-500 text-center py-2">Waiting for counterparty to fund.</p>
          )}

          {canSubmitProof && (
            <div className="space-y-2">
              <input type="text" value={proofInput} onChange={e => setProofInput(e.target.value)}
                placeholder="Proof reference (URL, tracking #)…"
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 px-3 py-2 rounded-md font-mono text-xs placeholder:text-zinc-700 focus:border-emerald-500 transition-colors" />
              <button onClick={doProof} disabled={!proofInput || txPending}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black py-2.5 rounded-md font-mono text-xs font-bold transition-colors cursor-pointer">
                Submit Proof
              </button>
            </div>
          )}

          {canRelease && (
            <button onClick={doRelease} disabled={txPending || txReceiptLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold transition-colors cursor-pointer disabled:opacity-50">
              Release & Settle
            </button>
          )}

          {canExpire && (
            <button onClick={doExpire} disabled={txPending || txReceiptLoading}
              className="w-full bg-rose-500/10 hover:bg-rose-500/15 text-rose-300 border border-rose-500/25 py-2.5 rounded-md font-mono text-xs font-medium transition-colors cursor-pointer disabled:opacity-50">
              Trigger Expiry
            </button>
          )}

          {/* Secondary */}
          {canCancel && (
            <button onClick={doCancel} disabled={txPending || txReceiptLoading}
              className="w-full bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 text-zinc-300 py-2.5 rounded-md font-mono text-xs transition-colors cursor-pointer disabled:opacity-50">
              Cancel Pact
            </button>
          )}
          {canReject && (
            <button onClick={doReject} disabled={txPending || txReceiptLoading}
              className="w-full bg-rose-500/10 hover:bg-rose-500/15 text-rose-300 border border-rose-500/25 py-2.5 rounded-md font-mono text-xs transition-colors cursor-pointer disabled:opacity-50">
              Reject Proof
            </button>
          )}
        </div>
      )}
    </main>
  )
}

function Row({ label, value, link, tag, muted }: { label: string; value: string; link?: string; tag?: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 px-4 text-xs font-mono">
      <span className="text-zinc-500">{label}</span>
      <span className={`flex items-center gap-1.5 ${muted ? 'text-zinc-600 italic' : 'text-zinc-300'}`}>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="hover:text-emerald-400 transition-colors">{value} ↗</a>
        ) : value}
        {tag && <span className="text-emerald-400 text-[10px] font-medium">{tag}</span>}
      </span>
    </div>
  )
}
