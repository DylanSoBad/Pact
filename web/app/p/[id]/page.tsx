'use client'

import { useState, useEffect, use, useRef } from 'react'
import Link from 'next/link'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress } from 'viem'
import { fetchPacts, fetchReputation, PactData } from '../../../lib/reads'
import { getPactAddress } from '../../../lib/arc'
import {
  kindLabel, statusLabel, formatAmount, tokenSymbol,
  formatDate, truncateAddress, isZeroAddress, isTerminal
} from '../../../lib/format'
import { PACT_ABI, ERC20_ABI } from '../../../lib/abi'
import { verifyTerms } from '../../../lib/terms'
import PactStateMachine from '../../../components/PactStateMachine'
import Countdown from '../../../components/Countdown'

export default function PactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams.id
  const { address, isConnected } = useAccount()
  const [pact, setPact] = useState<PactData | null>(null)
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState(false)
  const [lastFetch, setLastFetch] = useState<number>(Date.now())
  const [proofInput, setProofInput] = useState('')
  const [termsVerified, setTermsVerified] = useState<boolean | null>(null)
  const [verifyInput, setVerifyInput] = useState('')
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [termsParam, setTermsParam] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const pendingFundId = useRef<bigint | null>(null)
  const processedApprovalHash = useRef<string | null>(null)

  const [makerRep, setMakerRep] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)
  const [takerRep, setTakerRep] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      setTermsParam(sp.get('terms'))
    }
  }, [])

  const getActivePactAddress = (): `0x${string}` => {
    if (typeof window !== 'undefined') {
      const sharedAddress = new URLSearchParams(window.location.search).get('contract')
      if (sharedAddress && isAddress(sharedAddress)) return sharedAddress
    }
    return getPactAddress()
  }

  async function load() {
    try {
      const contractAddress = getActivePactAddress()
      const data = await fetchPacts(50, contractAddress)
      const found = data.find(p => p.id.toString() === id)
      if (found) {
        setPact(found)
        document.title = `PACT #${found.id} · ${kindLabel(found.kind)}`

        // Fetch reputation for maker and taker asynchronously
        fetchReputation(found.maker as `0x${string}`, contractAddress).then(setMakerRep)
        if (!isZeroAddress(found.taker)) {
          fetchReputation(found.taker as `0x${string}`, contractAddress).then(setTakerRep)
        }

        // Verify terms from URL param if available
        if (typeof window !== 'undefined') {
          const sp = new URLSearchParams(window.location.search)
          const termsFromUrl = sp.get('terms')
          if (termsFromUrl) {
            const raw = decodeURIComponent(termsFromUrl)
            const ok = verifyTerms(raw, found.termsHash as `0x${string}`)
            setTermsVerified(ok)
          }
        }
      }
      setRpcError(false)
      setLastFetch(Date.now())
    } catch (err) {
      console.error(err)
      setRpcError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ok = true
    load()
    const iv = setInterval(() => { if (ok && !document.hidden) load() }, 3000)
    const vis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', vis)
    return () => { ok = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [id])

  const { writeContract, data: txHash, isPending: txPending } = useWriteContract()
  const { isLoading: txWaiting, isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (txSuccess && txHash && pendingFundId.current !== null && processedApprovalHash.current !== txHash) {
      const idToFund = pendingFundId.current
      pendingFundId.current = null
      processedApprovalHash.current = txHash
      writeContract({
        address: getActivePactAddress(),
        abi: PACT_ABI,
        functionName: 'fund',
        args: [idToFund],
      })
      return
    }
    if (txSuccess) {
      setTimeout(() => load(), 1500)
    }
  }, [txSuccess, txHash])

  const isMaker = !!address && !!pact && pact.maker.toLowerCase() === address.toLowerCase()
  const isTaker = !!address && !!pact && !isZeroAddress(pact.taker) && pact.taker.toLowerCase() === address.toLowerCase()
  const isOpenCandidate = !!address && !!pact && isZeroAddress(pact.taker) && !isMaker

  const canFund = isConnected && !!pact && pact.status === 0 && (isTaker || isOpenCandidate)
  const canProof = isConnected && !!pact && pact.kind !== 1 && pact.status === 2 && isTaker
  const canRelease = isConnected && !!pact && (pact.status === 2 || pact.status === 3) && (isMaker || (pact.kind === 1 && isTaker))
  const canCancel = isConnected && !!pact && pact.status === 0 && isMaker
  const canReject = isConnected && !!pact && pact.status === 3 && isMaker
  const canExpire = isConnected && !!pact && [0, 2, 3].includes(pact.status) && Math.floor(Date.now() / 1000) > pact.deadline

  // Optimistic effective status for real-time progress transitions
  const currentEffectiveStatus = txPending || txWaiting
    ? (canFund ? 2 : canProof ? 3 : canRelease ? 4 : canCancel ? 1 : pact?.status ?? 0)
    : pact?.status ?? 0

  const doProof = () => {
    if (!proofInput) return
    const encoder = new TextEncoder()
    const data = encoder.encode(proofInput)
    crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('') as `0x${string}`
      writeContract({
        address: getActivePactAddress(),
        abi: PACT_ABI,
        functionName: 'submitProof',
        args: [BigInt(id), hashHex]
      })
    })
  }

  const doFund = () => {
    if (!pact) return
    const pactAddress = getActivePactAddress()

    // If taker bond is required, execute approve -> fund flow
    if (pact.amountTaker > 0n) {
      pendingFundId.current = BigInt(id)
      writeContract({
        address: pact.tokenTaker as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [pactAddress, pact.amountTaker]
      })
      return
    }

    writeContract({
      address: pactAddress,
      abi: PACT_ABI,
      functionName: 'fund',
      args: [BigInt(id)]
    })
  }

  const doCancel = () => writeContract({ address: getActivePactAddress(), abi: PACT_ABI, functionName: 'cancel', args: [BigInt(id)] })
  const doReject = () => {
    writeContract({ address: getActivePactAddress(), abi: PACT_ABI, functionName: 'reject', args: [BigInt(id)] })
    setShowDisputeModal(false)
  }
  const doRelease = () => writeContract({ address: getActivePactAddress(), abi: PACT_ABI, functionName: 'release', args: [BigInt(id)] })
  const doExpire = () => writeContract({ address: getActivePactAddress(), abi: PACT_ABI, functionName: 'expire', args: [BigInt(id)] })

  const currentUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${id}?contract=${encodeURIComponent(getActivePactAddress())}` : ''
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
    <div className="w-full max-w-terminal mx-auto font-mono">
      <div className="flex items-center justify-center py-24 text-[13px] text-zinc-500 gap-3">
        <div className="w-3 h-3 bg-[#c8f542] animate-pulse-soft" />
        LOADING PACT DATA...
      </div>
    </div>
  )

  if (!pact) return (
    <div className="w-full max-w-terminal mx-auto font-mono">
      <div className="text-center py-24 space-y-4 border border-zinc-800 bg-[#0c0d10] mt-8 px-4">
        <p className="text-[13px] text-zinc-500">Pact #{id.toString().padStart(4, '0')} does not exist or is uninitialized.</p>
        <Link href="/" className="text-[12px] text-[#c8f542] underline inline-block">← RETURN TO FEED</Link>
      </div>
    </div>
  )

  const busy = txPending || txWaiting

  return (
    <div className="w-full max-w-terminal mx-auto font-mono">
      {/* Header & Quick Action Share */}
      <div className="flex items-center justify-between mb-6 animate-enter border-b border-zinc-800 pb-4">
        <div>
          <Link href="/" className="text-[12px] text-zinc-500 hover:text-[#c8f542] transition-colors underline mb-2 inline-block">← RETURN TO FEED</Link>
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
            className="btn-ghost px-3 py-1.5 text-[12px] text-zinc-400 hover:text-white hidden @md:flex items-center gap-1.5"
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
                : 'NO INITIAL COLLATERAL'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[12px] text-zinc-500 block mb-1 uppercase tracking-widest">Counterparty Address</span>
            <span className="font-mono text-[13px] text-zinc-400">
              {isZeroAddress(pact.taker) ? 'OPEN CANDIDATE POOL' : truncateAddress(pact.taker)}
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
              {termsVerified ? 'SHA-256 VERIFIED' : 'INTEGRITY MISMATCH'}
            </span>
          )}
        </div>

        <div className="bg-black p-3.5 border border-zinc-800 text-[12px] text-zinc-400 font-mono select-text leading-loose whitespace-pre-wrap">
          {termsParam ? decodeURIComponent(termsParam) : 'Terms are shared off-chain. Paste them below to verify their on-chain hash.'}
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
      {(makerRep || takerRep) && (
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 mb-8">
          {makerRep && (
            <div className="surface-0 border border-zinc-800 p-4">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500 block mb-3">Maker Trust Score</span>
              <div className="flex items-center gap-6 text-[12px]">
                <div><span className="text-zinc-500 uppercase tracking-widest">Cleared</span><span className="ml-2 text-[#c8f542] font-bold">{makerRep.cleared}</span></div>
                <div><span className="text-zinc-500 uppercase tracking-widest">Slashed</span><span className="ml-2 text-rose-400 font-bold">{makerRep.slashed}</span></div>
                <div><span className="text-zinc-500 uppercase tracking-widest">Vol</span><span className="ml-2 text-zinc-400 font-bold">${formatAmount(makerRep.notional)}</span></div>
              </div>
            </div>
          )}
          {takerRep && (
            <div className="surface-0 border border-zinc-800 p-4">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500 block mb-3">Counterparty Trust Score</span>
              <div className="flex items-center gap-6 text-[12px]">
                <div><span className="text-zinc-500 uppercase tracking-widest">Cleared</span><span className="ml-2 text-[#c8f542] font-bold">{takerRep.cleared}</span></div>
                <div><span className="text-zinc-500 uppercase tracking-widest">Slashed</span><span className="ml-2 text-rose-400 font-bold">{takerRep.slashed}</span></div>
                <div><span className="text-zinc-500 uppercase tracking-widest">Vol</span><span className="ml-2 text-zinc-400 font-bold">${formatAmount(takerRep.notional)}</span></div>
              </div>
            </div>
          )}
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
          <div className="bg-[#0c0d10] border border-rose-500/30 rounded-none p-6 max-w-[28rem] w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <h3 className="text-[15px] font-bold uppercase tracking-widest">
                Initiate Dispute & Bond Slash
              </h3>
            </div>

            <p className="text-[13px] text-zinc-400 leading-relaxed">
              Rejecting fulfillment marks this pact as <strong className="text-rose-400">SLASHED</strong>. The counterparty&apos;s bond will be forfeited to the maker according to deterministic smart contract logic.
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
    </div>
  )
}
