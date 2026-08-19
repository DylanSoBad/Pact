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
import { getPactAddress } from '../../../lib/arc'

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
  const [showShareModal, setShowShareModal] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeConfirmed, setDisputeConfirmed] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [lastFetch, setLastFetch] = useState(Date.now())
  const [rpcError, setRpcError] = useState(false)


  useEffect(() => { if (id) document.title = `PACT · #${id.toString().padStart(4, '0')}` }, [id])

  const { writeContract, data: txHash, isPending: txPending, error: writeError } = useWriteContract()
  const { isSuccess: txConfirmed, isLoading: txWaiting } = useWaitForTransactionReceipt({ hash: txHash })

  async function load() {
    if (document.hidden) return
    try {
      const d = await fetchSinglePact(id)
      if (d) {
        if (pact && pact.status !== d.status && notificationsEnabled && typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification(`PACT #${id} Status Updated`, {
              body: `Current state is now: ${d.status === 2 ? 'ACTIVE' : d.status === 3 ? 'PROOF SUBMITTED' : d.status === 4 ? 'CLEARED' : 'SETTLED'}`,
              icon: '/logo.png'
            })
          }
        }

        setPact(d)
        setRpcError(false)
        setLastFetch(Date.now())
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
  }, [id, termsParam, notificationsEnabled])

  useEffect(() => { if (txConfirmed) load() }, [txConfirmed])

  const requestNotifications = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          setNotificationsEnabled(true)
          new Notification('PACT Notifications Active', {
            body: `You will be alerted when Pact #${id} receives funds or proof.`,
            icon: '/logo.png'
          })
        }
      })
    }
  }

  const isMaker = address && pact && pact.maker.toLowerCase() === address.toLowerCase()
  const isTaker = address && pact && !isZeroAddress(pact.taker) && pact.taker.toLowerCase() === address.toLowerCase()
  const isOpenTaker = pact && isZeroAddress(pact.taker) && !isMaker

  const currentEffectiveStatus = pact ? pact.status : 0

  const canFund = pact && pact.status === 0 && !isMaker && (isOpenTaker || isTaker)
  const canCancel = pact && pact.status === 0 && isMaker
  const canProof = pact && pact.status === 2 && isTaker && pact.kind !== 1
  const canReject = pact && pact.status === 3 && isMaker && pact.kind !== 1
  const canRelease = pact && ((pact.kind === 1 && pact.status === 2 && (isMaker || isTaker)) || (pact.kind !== 1 && (pact.status === 2 || pact.status === 3) && isMaker))
  const expired = pact && Number(pact.deadline) < Math.floor(Date.now() / 1000)
  const canExpire = pact && expired && !isTerminal(pact.status) && [0, 2, 3].includes(pact.status)

  const doFund = () => {
    if (!pact) return
    const pactAddress = getPactAddress()
    if (pact.amountTaker > 0n) {
      writeContract({ address: pact.tokenTaker as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [pactAddress, pact.amountTaker] })
    }
    writeContract({ address: pactAddress, abi: PACT_ABI, functionName: 'fund', args: [BigInt(id)] })
  }

  const doCancel = () => writeContract({ address: getPactAddress(), abi: PACT_ABI, functionName: 'cancel', args: [BigInt(id)] })

  const doProof = () => {
    if (!proofInput) return
    import('viem').then(({ keccak256, toHex }) => {
      writeContract({
        address: getPactAddress(),
        abi: PACT_ABI,
        functionName: 'submitProof',
        args: [BigInt(id), keccak256(toHex(new TextEncoder().encode(proofInput)))]
      })
    })
  }

  const doReject = () => {
    writeContract({ address: getPactAddress(), abi: PACT_ABI, functionName: 'reject', args: [BigInt(id)] })
    setShowDisputeModal(false)
  }

  const doRelease = () => writeContract({ address: getPactAddress(), abi: PACT_ABI, functionName: 'release', args: [BigInt(id)] })
  const doExpire = () => writeContract({ address: getPactAddress(), abi: PACT_ABI, functionName: 'expire', args: [BigInt(id)] })



  const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
  const copyShareLink = () => {
    navigator.clipboard.writeText(currentUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const copyPlaintextSummary = () => {
    if (!pact) return
    const text = `PACT #${id}\nType: ${kindLabel(pact.kind)}\nMaker Locked: ${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}\n${pact.amountTaker > 0n ? `Taker Bond: ${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}\n` : ''}Deadline: ${formatDate(pact.deadline)}\nLink: ${currentUrl}\nTerms: "${termsParam ? decodeURIComponent(termsParam) : 'On-chain SHA-256'}"`
    navigator.clipboard.writeText(text)
    setCopiedSummary(true)
    setTimeout(() => setCopiedSummary(false), 2000)
  }

  if (loading) return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20 font-mono">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />
      <div className="flex items-center justify-center py-24 text-[13px] text-zinc-500 gap-3">
        <div className="w-3 h-3 bg-[#c8f542] animate-pulse-soft" />
        LOADING_PACT_DATA...
      </div>
    </main>
  )

  if (!pact) return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20 font-mono">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />
      <div className="text-center py-24 space-y-4 border border-zinc-800 bg-[#0c0d10] mt-8">
        <p className="text-[13px] text-zinc-500">Pact #{id.toString().padStart(4, '0')} does not exist or is uninitialized.</p>
        <Link href="/" className="text-[12px] text-[#c8f542] underline inline-block">← return_to_feed</Link>
      </div>
    </main>
  )

  const busy = txPending || txWaiting

  return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-24 overflow-x-hidden font-mono">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />

      {/* Header & Quick Action Share */}
      <div className="flex items-center justify-between mb-6 animate-enter border-b border-zinc-800 pb-4">
        <div>
          <Link href="/" className="text-[12px] text-zinc-500 hover:text-[#c8f542] transition-colors underline mb-2 inline-block">← return_to_feed</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-white uppercase tracking-widest">
              &gt; PACT #{id.toString().padStart(4, '0')}
            </h1>
            <span className="text-[11px] font-mono uppercase px-2 py-0.5 bg-[#18181b] text-[#c8f542] border border-[#c8f542]">
              {kindLabel(pact.kind)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyShareLink}
            className="btn-ghost px-3 py-1.5 text-[12px] text-zinc-400 hover:text-white flex items-center gap-1.5"
          >
            {copiedLink ? 'Copied' : 'Share Link'}
          </button>
          <button
            onClick={copyPlaintextSummary}
            className="btn-ghost px-3 py-1.5 text-[12px] text-zinc-400 hover:text-white hidden sm:flex items-center gap-1.5"
          >
            {copiedSummary ? 'Copied' : 'Copy Summary'}
          </button>
        </div>
      </div>

      {/* Multi-step Visual Progress State Machine */}
      <PactStateMachine status={currentEffectiveStatus} />



      {/* Countdown Timer for Active Deals */}
      {pact.status === 2 && (
        <div className="mb-6 surface-1 rounded-none p-4 border border-zinc-800 flex items-center justify-between text-zinc-400">
          <div>
            <span className="text-[12px] block uppercase tracking-widest text-zinc-500">Settlement Timeout</span>
            <span className="text-[13px]">{formatDate(pact.deadline)}</span>
          </div>
          <Countdown deadlineTs={pact.deadline} />
        </div>
      )}

      {/* Core Financial Ledger Card */}
      <div className="surface-1 rounded-none p-5 mb-6 border border-zinc-800 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[12px] text-zinc-500 block mb-1 uppercase tracking-widest">Maker Collateral Locked</span>
            <div className="text-[20px] font-bold text-[#c8f542] tracking-wider">
              ${formatAmount(pact.amountMaker)}{' '}
              <span className="text-[13px] font-normal text-zinc-500">{tokenSymbol(pact.tokenMaker)}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[12px] text-zinc-500 block mb-1 uppercase tracking-widest">Maker Address</span>
            <span className="font-mono text-[13px] text-zinc-400">{truncateAddress(pact.maker)}</span>
          </div>
        </div>

        <div className="separator" />

        <div className="flex justify-between items-start">
          <div>
            <span className="text-[12px] text-zinc-500 block mb-1 uppercase tracking-widest">Counterparty Bond</span>
            <div className="text-[14px] font-bold text-zinc-400">
              {pact.amountTaker > 0n
                ? `$${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}`
                : 'NO_INITIAL_COLLATERAL'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[12px] text-zinc-500 block mb-1 uppercase tracking-widest">Counterparty Address</span>
            <span className="font-mono text-[13px] text-zinc-400">
              {isZeroAddress(pact.taker) ? 'OPEN_CANDIDATE_POOL' : truncateAddress(pact.taker)}
            </span>
          </div>
        </div>
      </div>

      {/* Agreement Terms with SHA-256 Integrity Seal */}
      <div className="surface-1 rounded-none p-5 mb-6 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-white uppercase tracking-widest">Agreement Terms</h3>
          {termsVerified !== null && (
            <span className={`text-[10px] font-mono px-2 py-0.5 border ${
              termsVerified ? 'bg-[#c8f542]/10 text-[#c8f542] border-[#c8f542]/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              {termsVerified ? 'SHA256_MATCH' : 'INTEGRITY_MISMATCH'}
            </span>
          )}
        </div>

        <div className="bg-black p-3.5 border border-zinc-800 text-[12px] text-zinc-400 font-mono select-text leading-loose whitespace-pre-wrap">
          {termsParam ? decodeURIComponent(termsParam) : 'Encoded terms embedded on-chain.'}
        </div>

        <div className="pt-2">
          <label className="text-[11px] uppercase tracking-widest text-zinc-500 block mb-1.5">Verify Plaintext against On-Chain Hash</label>
          <div className="flex gap-2">
            <input
              value={verifyInput}
              onChange={e => setVerifyInput(e.target.value)}
              placeholder="Paste exact agreement plaintext…"
              className="flex-1 bg-black border border-zinc-800 text-white px-3 py-1.5 rounded-none text-[12px] font-mono focus:border-[#c8f542] focus:ring-0 outline-none"
            />
            <button
              onClick={() => setTermsVerified(verifyTerms(verifyInput, pact.termsHash as `0x${string}`))}
              className="btn-ghost px-4 py-1.5 text-[12px] border-zinc-700"
            >
              Verify
            </button>
          </div>
        </div>
      </div>

      {/* On-Chain Cryptographic Hashes */}
      <div className="mb-6">
        <span className="text-[11px] uppercase tracking-widest text-zinc-500 block mb-2">On-chain Cryptographic Hashes</span>
        <div className="font-mono text-[10px] text-zinc-500 break-all space-y-2 surface-1 rounded-none p-3.5 border border-zinc-800">
          <div><span className="text-zinc-600">termsHash: </span>{pact.termsHash}</div>
          {pact.proofHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
            <div>
              <span className="text-zinc-600">proofHash: </span>
              <span className="text-[#c8f542]">{pact.proofHash}</span>
            </div>
          )}
        </div>
      </div>

      {/* Maker Reputation Track Record */}
      {makerRep && (
        <div className="flex items-center gap-6 mb-8 text-[12px] p-3 rounded-none surface-0 border border-zinc-800">
          <div>
            <span className="text-zinc-500 uppercase tracking-widest">Cleared</span>
            <span className="ml-2 text-[#c8f542] font-bold">{makerRep.cleared}</span>
          </div>
          <div>
            <span className="text-zinc-500 uppercase tracking-widest">Slashed</span>
            <span className="ml-2 text-rose-400 font-bold">{makerRep.slashed}</span>
          </div>
          <div>
            <span className="text-zinc-500 uppercase tracking-widest">Settled Vol</span>
            <span className="ml-2 text-zinc-400 font-bold">${formatAmount(makerRep.notional)}</span>
          </div>
        </div>
      )}

      {/* TX Status */}
      {busy && (
        <div className="mb-6 text-[12px] text-[#c8f542] flex items-center gap-2 p-3 rounded-none bg-[#c8f542]/10 border border-[#c8f542]/30">
          <div className="w-3 h-3 bg-[#c8f542] animate-pulse-soft" />
          <span>Confirming transaction on Circle Arc Testnet…</span>
          {txHash && (
            <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-[#c8f542] ml-auto underline text-[11px]">
              ArcScan ↗
            </a>
          )}
        </div>
      )}

      {writeError && (
        <div className="mb-6 text-[12px] text-rose-400 p-3 rounded-none bg-rose-500/[0.08] border border-rose-500/30">
          {writeError.message || 'Transaction execution failed.'}
        </div>
      )}

      {/* Primary & Secondary Role Actions */}
      {isConnected && !isTerminal(pact.status) && (
        <div className="space-y-3 pt-2">
          {canFund && (
            <button
              onClick={doFund}
              disabled={busy}
              className="btn-primary w-full py-3 text-[14px]"
            >
              {pact.amountTaker > 0n
                ? `Deposit Bond & Fund ($${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)})`
                : 'Accept & Fund Pact'}
            </button>
          )}

          {isMaker && pact.status === 0 && (
            <div className="text-center py-2 text-zinc-500 text-[13px]">
              Waiting for counterparty to deposit collateral and accept this pact.
            </div>
          )}

          {canProof && (
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 block">
                Fulfillment Proof Reference (Tracking URL / GitHub PR / Delivery ID):
              </label>
              <input
                value={proofInput}
                onChange={e => setProofInput(e.target.value)}
                placeholder="e.g. https://github.com/org/repo/pull/1 or Tracking #9400100"
                className="w-full bg-black border border-zinc-800 text-white px-3.5 py-2.5 rounded-none text-[13px] placeholder:text-zinc-700 focus:border-[#c8f542] outline-none focus:ring-0"
              />
              <button
                onClick={doProof}
                disabled={!proofInput || busy}
                className="btn-primary w-full py-3 text-[14px]"
              >
                Submit Cryptographic Proof
              </button>
            </div>
          )}

          {canRelease && (
            <button
              onClick={doRelease}
              disabled={busy}
              className="btn-primary w-full py-3 text-[14px]"
            >
              Release & Settle Funds
            </button>
          )}

          {canExpire && (
            <button
              onClick={doExpire}
              disabled={busy}
              className="btn-ghost w-full text-rose-400 border-rose-500/20 py-2.5 text-[13px] hover:bg-rose-500/[0.08]"
            >
              Trigger Timeout Expiry Settlement
            </button>
          )}

          {canCancel && (
            <button
              onClick={doCancel}
              disabled={busy}
              className="btn-ghost w-full text-zinc-400 py-2.5 text-[13px]"
            >
              Cancel Pact (Reclaim Funds)
            </button>
          )}

          {canReject && (
            <button
              onClick={() => setShowDisputeModal(true)}
              disabled={busy}
              className="btn-ghost w-full text-rose-400 border-rose-500/20 py-2.5 text-[13px] hover:bg-rose-500/[0.08]"
            >
              Reject Proof & Slash
            </button>
          )}
        </div>
      )}

      {/* ─── Safety Dispute Modal ─── */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-enter font-mono">
          <div className="bg-[#0c0d10] border border-rose-500/30 rounded-none p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <h3 className="text-[15px] font-bold uppercase tracking-widest">
                Initiate Dispute & Bond Slash
              </h3>
            </div>

            <p className="text-[13px] text-zinc-400 leading-relaxed">
                  Rejecting fulfillment marks this pact as <strong className="text-rose-400">SLASHED</strong>. The counterparty's bond will be forfeited to the maker according to deterministic smart contract logic.
            </p>

            <div className="flex gap-3 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="btn-ghost flex-1 py-2.5 text-[12px] uppercase tracking-widest border-zinc-800"
              >
                Go Back
              </button>
              <button
                onClick={doReject}
                className="btn-primary flex-1 py-2.5 text-[12px] uppercase tracking-widest bg-rose-500 border-rose-500 text-black hover:bg-rose-400"
              >
                Confirm Escalation
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
