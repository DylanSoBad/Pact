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
        // Trigger browser notification if status changed and user enabled notifications
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

  const canFund = pact && pact.status === 0 && !isMaker && (isOpenTaker || isTaker)
  const canCancel = pact && pact.status === 0 && isMaker
  const canProof = pact && pact.status === 2 && isTaker && pact.kind !== 1
  const canReject = pact && pact.status === 3 && isMaker && pact.kind !== 1
  const canRelease = pact && ((pact.kind === 1 && pact.status === 2 && (isMaker || isTaker)) || (pact.kind !== 1 && (pact.status === 2 || pact.status === 3) && isMaker))
  const expired = pact && Number(pact.deadline) < Math.floor(Date.now() / 1000)
  const canExpire = pact && expired && !isTerminal(pact.status) && [0, 2, 3].includes(pact.status)

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
    import('viem').then(({ keccak256, toHex }) => {
      writeContract({
        address: PACT_ADDRESS,
        abi: PACT_ABI,
        functionName: 'submitProof',
        args: [BigInt(id), keccak256(toHex(new TextEncoder().encode(proofInput)))]
      })
    })
  }
  const doReject = () => {
    writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'reject', args: [BigInt(id)] })
    setShowDisputeModal(false)
  }
  const doRelease = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'release', args: [BigInt(id)] })
  const doExpire = () => writeContract({ address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'expire', args: [BigInt(id)] })

  const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
  const copyShareLink = () => {
    navigator.clipboard.writeText(currentUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const copyPlaintextSummary = () => {
    if (!pact) return
    const text = `🤝 PACT PROTOCOL ESCROW #${id}\nType: ${kindLabel(pact.kind)}\nMaker Locked: ${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}\n${pact.amountTaker > 0n ? `Taker Bond: ${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}\n` : ''}Deadline: ${formatDate(pact.deadline)}\nLink: ${currentUrl}\nTerms: "${termsParam ? decodeURIComponent(termsParam) : 'On-chain SHA-256'}"`
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
      <div className="text-center py-20">
        <p className="text-[15px] text-zinc-400 mb-2">Pact #{id} not found on Arc</p>
        <Link href="/" className="text-[13px] text-emerald-400 hover:text-emerald-300">← Return to Dashboard</Link>
      </div>
    </main>
  )

  const role = isMaker ? 'Maker (Creator)' : isTaker ? 'Taker (Counterparty)' : isOpenTaker ? 'Candidate Taker' : 'Observer'
  const roleCol = isMaker ? 'text-emerald-400' : (isTaker || isOpenTaker) ? 'text-amber-400' : 'text-zinc-500'
  const busy = txPending || txWaiting

  return (
    <main className="min-h-screen max-w-[660px] mx-auto px-5 sm:px-8 pb-20 overflow-x-hidden relative">
      <Navbar />
      <TrustStrip lastUpdated={lastFetch} rpcError={rpcError} onRetry={load} />

      {/* Header with Omni-Share & Notification Toggle */}
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

        <div className="flex items-center gap-2 mt-4 sm:mt-6">
          {!isTerminal(pact.status) && (
            <button
              onClick={requestNotifications}
              title={notificationsEnabled ? 'Notifications active' : 'Enable browser alerts for this pact'}
              className={`btn-ghost px-2.5 py-1 text-[12px] ${notificationsEnabled ? 'text-emerald-400 border-emerald-500/30' : 'text-zinc-500'}`}
            >
              🔔 {notificationsEnabled ? 'Alerts on' : 'Notify'}
            </button>
          )}

          <button
            onClick={() => setShowShareModal(true)}
            className="btn-ghost px-3 py-1 text-[12px] text-zinc-400"
          >
            Share 🔗
          </button>
        </div>
      </div>

      {/* State machine */}
      <div className="animate-enter-delay">
        <PactStateMachine status={pact.status} />
      </div>

      {/* Terms & Verification */}
      {termsParam ? (
        <div className="mb-8 animate-enter-delay">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-zinc-500">Agreement Terms</span>
            {termsVerified === true && (
              <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                ✓ Cryptographically Verified
              </span>
            )}
            {termsVerified === false && (
              <span className="text-[11px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                ⚠️ Hash Mismatch
              </span>
            )}
          </div>
          <p className="surface-1 rounded-xl p-4 text-[13px] text-zinc-200 leading-relaxed border border-white/[0.04]">
            &ldquo;{decodeURIComponent(termsParam)}&rdquo;
          </p>
        </div>
      ) : (
        <div className="mb-8">
          <span className="text-[13px] text-zinc-500 block mb-2">Verify terms text</span>
          <div className="flex gap-2">
            <input
              value={verifyInput}
              onChange={e => setVerifyInput(e.target.value)}
              placeholder="Paste agreement terms to test against on-chain SHA-256 hash…"
              className="flex-1 bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2 rounded-xl text-[13px] placeholder:text-zinc-700"
            />
            <button
              onClick={() => { if (pact && verifyInput) setTermsVerified(verifyTerms(verifyInput, pact.termsHash as `0x${string}`)) }}
              className="btn-ghost px-4 py-2 text-[13px] text-zinc-300"
            >
              Verify
            </button>
          </div>
          {termsVerified !== null && (
            <p className={`text-[12px] mt-2 ${termsVerified ? 'text-emerald-400' : 'text-rose-400'}`}>
              {termsVerified ? '✓ SHA-256 checksum matches on-chain digest' : '✗ Checksum mismatch — do not proceed'}
            </p>
          )}
        </div>
      )}

      {/* Details Specs */}
      <div className="space-y-3 mb-8 text-[13px]">
        <Row label="Maker" val={truncateAddress(pact.maker)} link={`https://testnet.arcscan.app/address/${pact.maker}`} tag={isMaker ? 'you' : undefined} />
        <Row
          label="Taker"
          val={isZeroAddress(pact.taker) ? 'Open to any counterparty' : truncateAddress(pact.taker)}
          link={!isZeroAddress(pact.taker) ? `https://testnet.arcscan.app/address/${pact.taker}` : undefined}
          tag={isTaker ? 'you' : undefined}
        />
        <div className="separator" />
        <Row
          label="Maker Locked Principal"
          val={pact.blurSize ? 'Hidden on UI (Verifiable On-chain)' : `$${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)}`}
          dim={pact.blurSize}
        />
        {pact.amountTaker > 0n && (
          <Row
            label={pact.kind === 1 ? 'Taker Required Deposit' : 'Taker Collateral Bond'}
            val={pact.blurSize ? 'Hidden on UI' : `$${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}`}
            dim={pact.blurSize}
          />
        )}
        <div className="separator" />
        <Row label="Created At" val={formatDate(pact.createdAt)} />
        <div className="flex justify-between items-center">
          <span className="text-zinc-500">Settlement Deadline</span>
          <span className={expired ? 'text-rose-400' : 'text-zinc-200'}>
            {formatDate(pact.deadline)}
            {!isTerminal(pact.status) && (
              <span className="text-emerald-400 ml-2 text-[12px]">
                (<Countdown deadlineTs={pact.deadline} />)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Cryptographic Digests & Proof Reference */}
      <div className="mb-8">
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
              Reject Proof & Dispute
            </button>
          )}
        </div>
      )}

      {/* ─── Senior Safety Dispute Modal ─── */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-enter">
          <div className="bg-[#111215] border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <span className="text-lg">⚠️</span>
              <h3 className="text-[16px] font-semibold">Initiate Dispute & Bond Slash</h3>
            </div>

            <p className="text-[13px] text-zinc-300 leading-relaxed">
              Rejecting fulfillment marks this pact as <strong className="text-rose-400">SLASHED</strong>. The counterparty&apos;s bond will be forfeited to the maker according to deterministic smart contract logic.
            </p>

            <div className="bg-rose-500/[0.06] border border-rose-500/20 rounded-xl p-3.5 text-[12px] text-zinc-400 space-y-1.5 font-mono">
              <p>• Permanent on-chain record on Circle Arc.</p>
              <p>• Counterparty slashedCount will increment.</p>
              <p>• Action is cryptographically irreversible.</p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={disputeConfirmed}
                onChange={e => setDisputeConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-transparent text-rose-500 focus:ring-rose-500/30"
              />
              <span className="text-[12px] text-zinc-300">
                I confirm the counterparty did not fulfill terms and accept responsibility for triggering this dispute.
              </span>
            </label>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="btn-ghost flex-1 py-2.5 text-[13px] text-zinc-400"
              >
                Go Back
              </button>
              <button
                onClick={doReject}
                disabled={!disputeConfirmed || busy}
                className="btn-primary flex-1 py-2.5 text-[13px] bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40"
              >
                Confirm Slash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Omni-Channel Share Drawer Modal ─── */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-enter">
          <div className="bg-[#111215] border border-white/[0.08] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <h3 className="text-[15px] font-semibold text-white">Share Escrow with Counterparty</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-zinc-500 hover:text-white text-[14px] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 1-Click Social Triggers */}
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(`🤝 Bilateral Escrow #${id} on Circle Arc`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost py-3 flex flex-col items-center gap-1 text-[12px] text-zinc-300 hover:text-white"
              >
                <span>✈️</span>
                <span>Telegram</span>
              </a>

              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Review our PACT escrow contract #${id}: ${currentUrl}`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost py-3 flex flex-col items-center gap-1 text-[12px] text-zinc-300 hover:text-white"
              >
                <span>💬</span>
                <span>WhatsApp</span>
              </a>

              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Decentralized Escrow #${id} initialized on @Circle Arc.`)}&url=${encodeURIComponent(currentUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost py-3 flex flex-col items-center gap-1 text-[12px] text-zinc-300 hover:text-white"
              >
                <span>𝕏</span>
                <span>Twitter / X</span>
              </a>
            </div>

            {/* Direct Link Box */}
            <div className="space-y-1.5">
              <label className="text-[12px] text-zinc-500">Direct Shareable Link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={currentUrl}
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] text-zinc-300 px-3 py-2 rounded-xl text-[12px] font-mono select-all"
                />
                <button
                  onClick={copyShareLink}
                  className="btn-primary px-3 py-2 text-[12px]"
                >
                  {copiedLink ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Formatted Invoice / Summary */}
            <button
              onClick={copyPlaintextSummary}
              className="btn-ghost w-full py-2.5 text-[12px] text-zinc-300 flex items-center justify-center gap-2"
            >
              📋 {copiedSummary ? 'Plaintext Contract Copied ✓' : 'Copy Plaintext Invoice for Discord / Email'}
            </button>
          </div>
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
        {tag && <span className="text-[11px] text-emerald-400 font-medium">{tag}</span>}
      </span>
    </div>
  )
}
