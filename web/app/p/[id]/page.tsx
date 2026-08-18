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
import { kindLabel, formatAmount, tokenSymbol, formatDate, truncateAddress, isTerminal, isZeroAddress } from '../../../lib/format'
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
  const [copiedShare, setCopiedShare] = useState(false)
  const [lastFetch, setLastFetch] = useState(Date.now())
  const [rpcError, setRpcError] = useState(false)

  useEffect(() => { if (id) document.title = `PACT · #${id.toString().padStart(4, '0')}` }, [id])

  const { writeContract, data: txHash, isPending: txPending, error: writeError } = useWriteContract()
  const { isSuccess: txConfirmed, isLoading: txWaiting } = useWaitForTransactionReceipt({ hash: txHash })

  async function load() {
    if (document.hidden) return
    try {
      const d = await fetchSinglePact(id)
      if (d) { setPact(d); setRpcError(false); setLastFetch(Date.now())
        if (termsParam) setTermsVerified(verifyTerms(termsParam, d.termsHash as `0x${string}`))
        setMakerRep(await fetchReputation(d.maker as `0x${string}`))
      }
    } catch { setRpcError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let ok = true; load()
    const iv = setInterval(() => { if (ok && !document.hidden) load() }, 10000)
    const vis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', vis)
    return () => { ok = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [id, termsParam])

  useEffect(() => { if (txConfirmed) load() }, [txConfirmed])

  const isMaker = address && pact && pact.maker.toLowerCase() === address.toLowerCase()
  const isTaker = address && pact && !isZeroAddress(pact.taker) && pact.taker.toLowerCase() === address.toLowerCase()
  const isOpenTaker = pact && isZeroAddress(pact.taker) && !isMaker

  const canFund = pact && pact.status === 0 && !isMaker && (isOpenTaker || isTaker)
  const canCancel = pact && pact.status === 0 && isMaker
  const canProof = pact && pact.status === 2 && isTaker && pact.kind !== 1
  const canReject = pact && pact.status === 3 && isMaker && pact.kind !== 1
  const canRelease = pact && ((pact.kind === 1 && pact.status === 2 && (isMaker || isTaker)) || (pact.kind !== 1 && (pact.status === 2 || pact.status === 3) && isMaker))
  const expired = pact && Number(pact.deadline) < Math.floor(Date.now() / 1000)
  const canExpire = pact && expired && !isTerminal(pact.status) && [0, 2, 3].includes(pact.status)

  const doFund = () => { if (!pact) return; if (pact.amountTaker > 0n) writeContract({ address: pact.tokenTaker as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [PACT_ADDRESS, pact.amountTaker] }); writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'fund', args: [BigInt(id)] }) }
  const doCancel = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'cancel', args: [BigInt(id)] })
  const doProof = () => { if (!proofInput) return; import('viem').then(({ keccak256, toHex }) => { writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'submitProof', args: [BigInt(id), keccak256(toHex(new TextEncoder().encode(proofInput)))] }) }) }
  const doReject = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'reject', args: [BigInt(id)] })
  const doRelease = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'release', args: [BigInt(id)] })
  const doExpire = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'expire', args: [BigInt(id)] })

  const copyShare = () => { navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : ''); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2e3) }

  if (loading) return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20"><Navbar /><TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />
      <div className="flex items-center justify-center py-24 text-[14px] text-zinc-600 gap-3"><div className="w-4 h-4 border-[1.5px] border-emerald-500 border-t-transparent rounded-full animate-spin" />Loading…</div>
    </main>
  )

  if (!pact) return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20"><Navbar /><TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />
      <div className="text-center py-20"><p className="text-[15px] text-zinc-400 mb-2">Pact #{id} not found</p><Link href="/" className="text-[13px] text-emerald-400 hover:text-emerald-300">← Dashboard</Link></div>
    </main>
  )

  const role = isMaker ? 'Maker' : isTaker ? 'Taker' : isOpenTaker ? 'Candidate' : 'Observer'
  const roleCol = isMaker ? 'text-emerald-400' : (isTaker || isOpenTaker) ? 'text-amber-400' : 'text-zinc-500'
  const busy = txPending || txWaiting

  return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20 overflow-x-hidden">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />

      {/* Header */}
      <div className="flex items-start justify-between mb-8 animate-enter">
        <div>
          <Link href="/" className="text-[13px] text-zinc-600 hover:text-zinc-400 transition-colors">← Back</Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-[20px] font-semibold text-white tracking-[-0.01em]">
              #{id.toString().padStart(4, '0')}
            </h1>
            <span className="text-[12px] text-zinc-600">{kindLabel(pact.kind)}</span>
            <span className={`text-[12px] font-medium ${roleCol}`}>{role}</span>
          </div>
        </div>
        <button
          onClick={copyShare}
          className="btn-ghost px-3 py-1 text-[12px] text-zinc-400 mt-6"
        >
          {copiedShare ? 'Copied ✓' : 'Share 🔗'}
        </button>
      </div>

      {/* State machine */}
      <div className="animate-enter-delay">
        <PactStateMachine status={pact.status} />
      </div>

      {/* Terms */}
      {termsParam && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-zinc-500">Terms</span>
            {termsVerified === true && <span className="text-[11px] text-emerald-400">✓ Verified</span>}
            {termsVerified === false && <span className="text-[11px] text-rose-400">✗ Mismatch</span>}
          </div>
          <p className="surface-1 rounded-xl p-4 text-[13px] text-zinc-300 leading-relaxed">
            &ldquo;{decodeURIComponent(termsParam)}&rdquo;
          </p>
        </div>
      )}

      {!termsParam && (
        <div className="mb-8">
          <span className="text-[13px] text-zinc-500 block mb-2">Verify terms</span>
          <div className="flex gap-2">
            <input value={verifyInput} onChange={e => setVerifyInput(e.target.value)} placeholder="Paste terms…"
              className="flex-1 bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2 rounded-xl text-[13px] placeholder:text-zinc-700" />
            <button
              onClick={() => { if (pact && verifyInput) setTermsVerified(verifyTerms(verifyInput, pact.termsHash as `0x${string}`)) }}
              className="btn-ghost px-4 py-2 text-[13px] text-zinc-300"
            >
              Check
            </button>
          </div>
          {termsVerified !== null && (
            <p className={`text-[12px] mt-2 ${termsVerified ? 'text-emerald-400' : 'text-rose-400'}`}>
              {termsVerified ? '✓ Hash matches' : '✗ Hash mismatch'}
            </p>
          )}
        </div>
      )}

      {/* Details */}
      <div className="space-y-3 mb-8 text-[13px]">
        <Row label="Maker" val={truncateAddress(pact.maker)} link={`https://testnet.arcscan.app/address/${pact.maker}`} tag={isMaker ? 'you' : undefined} />
        <Row label="Taker" val={isZeroAddress(pact.taker) ? 'Open' : truncateAddress(pact.taker)}
          link={!isZeroAddress(pact.taker) ? `https://testnet.arcscan.app/address/${pact.taker}` : undefined} tag={isTaker ? 'you' : undefined} />
        <div className="separator" />
        <Row label="Locked" val={pact.blurSize ? 'Hidden' : `${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}`} dim={pact.blurSize} />
        {pact.amountTaker > 0n && <Row label={pact.kind === 1 ? 'Counter' : 'Bond'} val={pact.blurSize ? 'Hidden' : `${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}`} dim={pact.blurSize} />}
        <div className="separator" />
        <Row label="Created" val={formatDate(pact.createdAt)} />
        <div className="flex justify-between items-center">
          <span className="text-zinc-500">Deadline</span>
          <span className={expired ? 'text-rose-400' : 'text-zinc-200'}>
            {formatDate(pact.deadline)}
            {!isTerminal(pact.status) && <span className="text-emerald-400 ml-2 text-[12px]"><Countdown deadlineTs={pact.deadline} /></span>}
          </span>
        </div>
      </div>

      {/* Hashes */}
      <div className="mb-8">
        <span className="text-[12px] text-zinc-600 block mb-2">Hashes</span>
        <div className="font-mono text-[11px] text-zinc-600 break-all space-y-1.5 surface-1 rounded-xl p-3.5">
          <div><span className="text-zinc-700">terms:</span> {pact.termsHash}</div>
          {pact.proofHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
            <div><span className="text-zinc-700">proof:</span> <span className="text-emerald-500">{pact.proofHash}</span></div>
          )}
        </div>
      </div>

      {/* Reputation */}
      {makerRep && (
        <div className="flex items-center gap-6 mb-8 text-[13px]">
          <div><span className="text-zinc-500">Cleared</span><span className="ml-2 text-emerald-400 font-semibold">{makerRep.cleared}</span></div>
          <div><span className="text-zinc-500">Slashed</span><span className="ml-2 text-rose-400 font-semibold">{makerRep.slashed}</span></div>
          <div><span className="text-zinc-500">Volume</span><span className="ml-2 text-zinc-200 font-semibold">${formatAmount(makerRep.notional)}</span></div>
        </div>
      )}

      {/* TX status */}
      {busy && (
        <div className="mb-6 text-[13px] text-amber-400 flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-[1.5px] border-amber-400 border-t-transparent rounded-full animate-spin" />
          Confirming…
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-amber-400 ml-auto">tx ↗</a>}
        </div>
      )}
      {writeError && <p className="mb-6 text-[13px] text-rose-400">{writeError.message || 'Failed'}</p>}

      {/* Actions with rich micro-animations */}
      {isConnected && !isTerminal(pact.status) && (
        <div className="space-y-3">
          {canFund && (
            <button onClick={doFund} disabled={busy}
              className="btn-primary w-full py-3 text-[14px]">
              {pact.amountTaker > 0n ? `Fund (${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)})` : 'Accept & fund'}
            </button>
          )}
          {isMaker && pact.status === 0 && <p className="text-[13px] text-zinc-600 text-center py-2">Waiting for counterparty.</p>}
          {canProof && (
            <div className="space-y-2">
              <input value={proofInput} onChange={e => setProofInput(e.target.value)} placeholder="Proof reference…"
                className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2.5 rounded-xl text-[14px] placeholder:text-zinc-700" />
              <button onClick={doProof} disabled={!proofInput || busy}
                className="btn-primary w-full py-3 text-[14px]">
                Submit proof
              </button>
            </div>
          )}
          {canRelease && (
            <button onClick={doRelease} disabled={busy}
              className="btn-primary w-full py-3 text-[14px]">
              Release & settle
            </button>
          )}
          {canExpire && (
            <button onClick={doExpire} disabled={busy}
              className="btn-ghost w-full text-rose-400 border-rose-500/20 py-2.5 text-[13px] hover:bg-rose-500/[0.08]">
              Trigger expiry
            </button>
          )}
          {canCancel && (
            <button onClick={doCancel} disabled={busy}
              className="btn-ghost w-full text-zinc-400 py-2.5 text-[13px]">
              Cancel pact
            </button>
          )}
          {canReject && (
            <button onClick={doReject} disabled={busy}
              className="btn-ghost w-full text-rose-400 border-rose-500/20 py-2.5 text-[13px] hover:bg-rose-500/[0.08]">
              Reject proof
            </button>
          )}
        </div>
      )}
    </main>
  )
}

function Row({ label, val, link, tag, dim }: { label: string; val: string; link?: string; tag?: string; dim?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-zinc-500">{label}</span>
      <span className={`flex items-center gap-1.5 ${dim ? 'text-zinc-600 italic' : 'text-zinc-200'}`}>
        {link ? <a href={link} target="_blank" rel="noreferrer" className="hover:text-emerald-400 transition-colors">{val} ↗</a> : val}
        {tag && <span className="text-[11px] text-emerald-400">{tag}</span>}
      </span>
    </div>
  )
}
