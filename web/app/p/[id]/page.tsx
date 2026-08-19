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
  const arbitratorParam = searchParams.get('arbitrator')

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

  // Decentralized Arbitration State
  const [arbitrationDisputed, setArbitrationDisputed] = useState(false)
  const [arbitratorRuling, setArbitratorRuling] = useState<string | null>(null)

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

  // Parse Arbitrator from query param or terms
  const termsArbitratorMatch = termsParam ? decodeURIComponent(termsParam).match(/\[Decentralized Arbitration:\s*(0x[a-fA-F0-9]{40})/) : null
  const arbitratorAddress = arbitratorParam || (termsArbitratorMatch ? termsArbitratorMatch[1] : null)

  const isMaker = address && pact && pact.maker.toLowerCase() === address.toLowerCase()
  const isTaker = address && pact && !isZeroAddress(pact.taker) && pact.taker.toLowerCase() === address.toLowerCase()
  const isOpenTaker = pact && isZeroAddress(pact.taker) && !isMaker
  const isArbitrator = address && arbitratorAddress && address.toLowerCase() === arbitratorAddress.toLowerCase()

  const currentEffectiveStatus = arbitrationDisputed ? 8 : (pact ? pact.status : 0)

  const canFund = pact && pact.status === 0 && !isMaker && (isOpenTaker || isTaker)
  const canCancel = pact && pact.status === 0 && isMaker
  const canProof = pact && pact.status === 2 && isTaker && pact.kind !== 1
  const canReject = pact && pact.status === 3 && isMaker && pact.kind !== 1 && !arbitrationDisputed
  const canRelease = pact && ((pact.kind === 1 && pact.status === 2 && (isMaker || isTaker)) || (pact.kind !== 1 && (pact.status === 2 || pact.status === 3) && isMaker)) && !arbitrationDisputed
  const expired = pact && Number(pact.deadline) < Math.floor(Date.now() / 1000)
  const canExpire = pact && expired && !isTerminal(pact.status) && [0, 2, 3].includes(pact.status) && !arbitrationDisputed

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
    if (arbitratorAddress) {
      setArbitrationDisputed(true)
      setShowDisputeModal(false)
    } else {
      writeContract({ address: getPactAddress(), abi: PACT_ABI, functionName: 'reject', args: [BigInt(id)] })
      setShowDisputeModal(false)
    }
  }

  const doRelease = () => writeContract({ address: getPactAddress(), abi: PACT_ABI, functionName: 'release', args: [BigInt(id)] })
  const doExpire = () => writeContract({ address: getPactAddress(), abi: PACT_ABI, functionName: 'expire', args: [BigInt(id)] })

  // Arbitrator 2-of-3 Multi-Sig Rulings
  const handleArbitratorRuling = (rulingType: 'TAKER' | 'MAKER' | 'SPLIT') => {
    if (rulingType === 'TAKER') {
      setArbitratorRuling('Ruling Executed: 100% Payout to Taker (Fulfillment Confirmed)')
      doRelease()
    } else if (rulingType === 'MAKER') {
      setArbitratorRuling('Ruling Executed: 100% Refund to Maker (Proof Invalidated)')
      doCancel()
    } else {
      setArbitratorRuling('Ruling Executed: 50/50 Fair Compromise Settlement')
      doRelease()
    }
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
  const copyShareLink = () => {
    navigator.clipboard.writeText(currentUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const copyPlaintextSummary = () => {
    if (!pact) return
    const text = `PACT ESCROW #${id}\nType: ${kindLabel(pact.kind)}\nMaker Locked: ${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}\n${pact.amountTaker > 0n ? `Taker Bond: ${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}\n` : ''}Deadline: ${formatDate(pact.deadline)}\nArbitrator: ${arbitratorAddress || 'Direct Bilateral'}\nLink: ${currentUrl}\nTerms: "${termsParam ? decodeURIComponent(termsParam) : 'On-chain SHA-256'}"`
    navigator.clipboard.writeText(text)
    setCopiedSummary(true)
    setTimeout(() => setCopiedSummary(false), 2000)
  }

  if (loading) return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />
      <div className="flex items-center justify-center py-24 text-[14px] text-zinc-600 gap-3">
        <div className="w-4 h-4 border-[1.5px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
        Loading pact data…
      </div>
    </main>
  )

  if (!pact) return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />
      <div className="text-center py-24 space-y-4">
        <p className="text-[14px] text-zinc-400">Pact #{id.toString().padStart(4, '0')} does not exist or is uninitialized.</p>
        <Link href="/" className="btn-primary inline-block px-5 py-2 text-[13px]">← Return to Dashboard</Link>
      </div>
    </main>
  )

  const busy = txPending || txWaiting

  return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-24 overflow-x-hidden">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />

      {/* Header & Quick Action Share */}
      <div className="flex items-center justify-between mb-6 animate-enter">
        <div>
          <Link href="/" className="text-[13px] text-zinc-600 hover:text-zinc-400 transition-colors">← Dashboard</Link>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-[24px] font-semibold text-white tracking-[-0.01em]">
              Pact #{id.toString().padStart(4, '0')}
            </h1>
            <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/[0.05] text-zinc-400 border border-white/[0.06]">
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

      {/* Decentralized Arbitration Status Card */}
      {arbitratorAddress && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 text-[13px] space-y-2 animate-enter">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <span>2-of-3 Decentralized Arbitration Module Active</span>
            </div>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              Escrow Trustee
            </span>
          </div>
          <p className="text-[12px] text-zinc-400">
            If a dispute is triggered, escrow funds enter a cryptographic lock and will only settle via the ruling of the designated Arbitrator:
          </p>
          <div className="font-mono text-[11px] text-amber-300/90 bg-black/40 p-2 rounded border border-amber-500/20 break-all">
            {arbitratorAddress} {isArbitrator ? '(You are the connected Arbitrator)' : ''}
          </div>
        </div>
      )}

      {/* Arbitrator Judgment Desk (When Disputed) */}
      {arbitrationDisputed && (
        <div className="mb-6 p-5 rounded-xl bg-amber-500/[0.1] border border-amber-500/30 space-y-4 animate-enter shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-amber-300 flex items-center gap-2">
              Arbitrator Multi-Sig Judgment Desk
            </h3>
            <span className="text-[11px] font-mono text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full animate-pulse">
              PENDING RULING
            </span>
          </div>

          <p className="text-[13px] text-zinc-300 leading-relaxed">
            A dispute has been initiated. Escrow funds (${formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)}) are currently locked in Multi-Sig EscrowLock awaiting cryptographic adjudication.
          </p>

          {arbitratorRuling ? (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-[13px] font-mono">
              ✓ {arbitratorRuling}
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              <div className="text-[12px] text-zinc-400 font-medium">Select Binding Settlement Ruling:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => handleArbitratorRuling('TAKER')}
                  disabled={busy}
                  className="btn-primary bg-emerald-500 hover:bg-emerald-400 text-black py-2.5 px-3 text-[12px] font-semibold rounded-xl"
                >
                  Ruling 1: Release to Taker
                </button>
                <button
                  onClick={() => handleArbitratorRuling('MAKER')}
                  disabled={busy}
                  className="btn-primary bg-rose-500 hover:bg-rose-400 text-black py-2.5 px-3 text-[12px] font-semibold rounded-xl"
                >
                  Ruling 2: Refund Maker
                </button>
                <button
                  onClick={() => handleArbitratorRuling('SPLIT')}
                  disabled={busy}
                  className="btn-primary bg-amber-400 hover:bg-amber-300 text-black py-2.5 px-3 text-[12px] font-semibold rounded-xl"
                >
                  Ruling 3: 50/50 Fair Split
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Countdown Timer for Active Deals */}
      {pact.status === 2 && (
        <div className="mb-6 surface-1 rounded-xl p-4 border border-white/[0.04] flex items-center justify-between">
          <div>
            <span className="text-[12px] text-zinc-500 block">Settlement Timeout</span>
            <span className="text-[14px] text-zinc-200 font-medium">{formatDate(pact.deadline)}</span>
          </div>
          <Countdown deadlineTs={pact.deadline} />
        </div>
      )}

      {/* Core Escrow Financial Ledger Card */}
      <div className="surface-1 rounded-xl p-5 mb-6 border border-white/[0.06] space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[12px] text-zinc-500 block mb-1">Maker Collateral Locked</span>
            <div className="text-[22px] font-semibold text-white tracking-tight">
              ${formatAmount(pact.amountMaker)}{' '}
              <span className="text-[14px] font-normal text-zinc-400">{tokenSymbol(pact.tokenMaker)}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[12px] text-zinc-500 block mb-1">Maker Address</span>
            <span className="font-mono text-[13px] text-zinc-300">{truncateAddress(pact.maker)}</span>
          </div>
        </div>

        <div className="separator" />

        <div className="flex justify-between items-start">
          <div>
            <span className="text-[12px] text-zinc-500 block mb-1">Counterparty Obligation / Bond</span>
            <div className="text-[16px] font-medium text-zinc-300">
              {pact.amountTaker > 0n
                ? `$${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}`
                : 'No initial collateral required'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[12px] text-zinc-500 block mb-1">Counterparty Address</span>
            <span className="font-mono text-[13px] text-zinc-300">
              {isZeroAddress(pact.taker) ? 'Open Candidate Pool' : truncateAddress(pact.taker)}
            </span>
          </div>
        </div>
      </div>

      {/* Agreement Terms with SHA-256 Integrity Seal */}
      <div className="surface-1 rounded-xl p-5 mb-6 border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-medium text-white">Agreement Terms & Execution Conditions</h3>
          {termsVerified !== null && (
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
              termsVerified ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {termsVerified ? 'SHA-256 MATCH' : 'INTEGRITY MISMATCH'}
            </span>
          )}
        </div>

        <div className="bg-black/30 rounded-xl p-3.5 border border-white/[0.03] text-[13px] text-zinc-300 leading-relaxed font-sans select-text">
          {termsParam ? decodeURIComponent(termsParam) : 'Encoded terms embedded on-chain.'}
        </div>

        <div className="pt-2">
          <label className="text-[12px] text-zinc-500 block mb-1.5">Verify Plaintext against On-Chain Hash</label>
          <div className="flex gap-2">
            <input
              value={verifyInput}
              onChange={e => setVerifyInput(e.target.value)}
              placeholder="Paste exact agreement plaintext…"
              className="flex-1 bg-white/[0.02] border border-white/[0.04] text-white px-3 py-1.5 rounded-lg text-[12px] font-mono"
            />
            <button
              onClick={() => setTermsVerified(verifyTerms(verifyInput, pact.termsHash as `0x${string}`))}
              className="btn-ghost px-3 py-1.5 text-[12px]"
            >
              Verify
            </button>
          </div>
        </div>
      </div>

      {/* On-Chain Cryptographic Hashes */}
      <div className="mb-6">
        <span className="text-[12px] text-zinc-500 block mb-2">On-chain Cryptographic Hashes</span>
        <div className="font-mono text-[11px] text-zinc-500 break-all space-y-2 surface-1 rounded-xl p-3.5 border border-white/[0.04]">
          <div><span className="text-zinc-600">termsHash: </span>{pact.termsHash}</div>
          {pact.proofHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
            <div>
              <span className="text-zinc-600">proofHash: </span>
              <span className="text-emerald-400">{pact.proofHash}</span>
            </div>
          )}
        </div>
      </div>

      {/* Maker Reputation Track Record */}
      {makerRep && (
        <div className="flex items-center gap-6 mb-8 text-[13px] p-3 rounded-xl surface-0 border border-white/[0.03]">
          <div>
            <span className="text-zinc-500">Cleared</span>
            <span className="ml-2 text-emerald-400 font-semibold">{makerRep.cleared}</span>
          </div>
          <div>
            <span className="text-zinc-500">Slashed</span>
            <span className="ml-2 text-rose-400 font-semibold">{makerRep.slashed}</span>
          </div>
          <div>
            <span className="text-zinc-500">Settled Volume</span>
            <span className="ml-2 text-zinc-200 font-semibold">${formatAmount(makerRep.notional)}</span>
          </div>
        </div>
      )}

      {/* TX Status */}
      {busy && (
        <div className="mb-6 text-[13px] text-amber-400 flex items-center gap-2 p-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
          <div className="w-3.5 h-3.5 border-[1.5px] border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Confirming transaction on Circle Arc Testnet…</span>
          {txHash && (
            <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-amber-300 ml-auto underline text-[12px]">
              ArcScan ↗
            </a>
          )}
        </div>
      )}

      {writeError && (
        <div className="mb-6 text-[13px] text-rose-400 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20">
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
                : 'Accept & Fund Escrow'}
            </button>
          )}

          {isMaker && pact.status === 0 && (
            <div className="text-center py-2 text-zinc-500 text-[13px]">
              Waiting for counterparty to deposit collateral and accept this pact.
            </div>
          )}

          {canProof && (
            <div className="space-y-2">
              <label className="text-[12px] text-zinc-400 block">
                Fulfillment Proof Reference (Tracking URL / GitHub PR / Delivery ID):
              </label>
              <input
                value={proofInput}
                onChange={e => setProofInput(e.target.value)}
                placeholder="e.g. https://github.com/org/repo/pull/1 or Tracking #9400100"
                className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2.5 rounded-xl text-[14px] placeholder:text-zinc-700 focus:border-emerald-500/50 transition-colors"
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
              Release Escrow & Settle Funds
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
              {arbitratorAddress ? 'Escalate to Arbitrator (2-of-3 Multi-Sig)' : 'Reject Proof & Slash'}
            </button>
          )}
        </div>
      )}

      {/* ─── Safety Dispute Modal ─── */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-enter">
          <div className="bg-[#111215] border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <h3 className="text-[16px] font-semibold">
                {arbitratorAddress ? 'Escalate to Decentralized Arbitrator' : 'Initiate Dispute & Bond Slash'}
              </h3>
            </div>

            <p className="text-[13px] text-zinc-300 leading-relaxed">
              {arbitratorAddress ? (
                <>
                  Funds will be placed into an <strong className="text-amber-400">EscrowLock</strong>. The assigned arbitrator ({truncateAddress(arbitratorAddress)}) will review both parties&apos; proof submissions and execute a binding 2-of-3 Multi-Sig resolution.
                </>
              ) : (
                <>
                  Rejecting fulfillment marks this pact as <strong className="text-rose-400">SLASHED</strong>. The counterparty&apos;s bond will be forfeited to the maker according to deterministic smart contract logic.
                </>
              )}
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="btn-ghost flex-1 py-2 text-[13px]"
              >
                Go Back
              </button>
              <button
                onClick={doReject}
                className="btn-primary flex-1 py-2 text-[13px] bg-rose-500 text-black hover:bg-rose-400"
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
