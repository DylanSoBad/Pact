'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { formatUnits, isAddress } from 'viem'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { toast } from 'sonner'
import { ERC20_ABI, PACT_ABI } from '../../../lib/abi'
import { USDC_ERC20, arcTestnet, getPactAddress } from '../../../lib/arc'
import { PactData, fetchSinglePact } from '../../../lib/reads'
import { formatAmount, formatDate, isTerminal, kindLabel, tokenSymbol, truncateAddress } from '../../../lib/format'
import { hashPactTerms, hashTerms, verifyPactTerms } from '../../../lib/terms'
import { signPermit, type PermitAuthorization } from '../../../lib/permit'
import PactStateMachine from '../../../components/PactStateMachine'
import Countdown from '../../../components/Countdown'
import TransactionProgress, { type TransactionStage } from '../../../components/TransactionProgress'
import { transactionErrorMessage } from '../../../lib/transactionErrors'

type DisputeData = {
  opener: `0x${string}`
  claim: number
  makerBond: bigint
  takerBond: bigint
  openedAt: bigint
  responseDeadline: bigint
  arbiterDeadline: bigint
}

export default function PactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const id = Number(idParam)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const protocolAddress = getPactAddress(chainId)

  const [pact, setPact] = useState<PactData | null>(null)
  const [dispute, setDispute] = useState<DisputeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyLabel, setBusyLabel] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStage, setTxStage] = useState<TransactionStage>('idle')
  const [txLabel, setTxLabel] = useState('')
  const [txError, setTxError] = useState('')
  const [termsInput, setTermsInput] = useState('')
  const [proofInput, setProofInput] = useState('')
  const [feeInput, setFeeInput] = useState('0')
  const [credits, setCredits] = useState<Record<string, bigint>>({})
  const [copiedId, setCopiedId] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const current = await fetchSinglePact(id)
    setPact(current)

    if (current && protocolAddress && publicClient && current.status === 3) {
      try {
        const value = await publicClient.readContract({
          address: protocolAddress,
          abi: PACT_ABI,
          functionName: 'getDispute',
          args: [BigInt(id)],
        })
        setDispute({ ...value, claim: Number(value.claim) })
      } catch {
        setDispute(null)
      }
    } else {
      setDispute(null)
    }

    if (current && address && protocolAddress && publicClient) {
      const tokens = [...new Set([current.tokenMaker, current.tokenTaker, USDC_ERC20].filter(token => isAddress(token)))] as `0x${string}`[]
      const balances = await Promise.all(
        tokens.map(async token => [token, await publicClient.readContract({
          address: protocolAddress,
          abi: PACT_ABI,
          functionName: 'credits',
          args: [address, token],
        })] as const)
      )
      setCredits(Object.fromEntries(balances))
    }
    setLoading(false)
  }, [address, id, protocolAddress, publicClient])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { document.title = `PACT · #${String(id).padStart(4, '0')}` }, [id])

  async function ensureExactAllowance(token: `0x${string}`, amount: bigint): Promise<PermitAuthorization | null> {
    if (amount === 0n || !address || !protocolAddress || !publicClient || !walletClient) return null
    const current = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, protocolAddress],
    })
    if (current === amount) return null

    setBusyLabel(`Authorize exactly ${formatUnits(amount, 6)} ${tokenSymbol(token)}`)
    setTxStage('awaiting-signature')
    setTxLabel(`Authorize exactly ${formatUnits(amount, 6)} ${tokenSymbol(token)}. No unlimited allowance requested.`)

    if (token.toLowerCase() === USDC_ERC20.toLowerCase()) {
      try {
        return await signPermit({
          publicClient,
          walletClient,
          chainId: arcTestnet.id,
          token: USDC_ERC20,
          owner: address,
          spender: protocolAddress,
          value: amount,
        })
      } catch {
        toast.info('Permit signature unavailable; falling back to exact ERC-20 approval')
      }
    }

    const approve = async (value: bigint) => {
      const simulation = await publicClient.simulateContract({
        account: address,
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [protocolAddress, value],
      })
      const hash = await walletClient.writeContract(simulation.request)
      setTxHash(hash)
      setTxStage('confirming')
      setTxLabel(`Exact ${tokenSymbol(token)} approval is confirming on Arc Testnet.`)
      await publicClient.waitForTransactionReceipt({ hash })
    }

    if (current !== 0n) await approve(0n)
    await approve(amount)
    return null
  }

  async function execute(functionName: string, args: readonly unknown[], label: string) {
    if (!address || !protocolAddress || !publicClient || !walletClient) {
      toast.error('Connect an active wallet on Arc Testnet')
      return
    }
    try {
      setBusyLabel(label)
      setTxHash(null)
      setTxError('')
      setTxStage('awaiting-signature')
      setTxLabel(`${label}. Confirm this on-chain transaction in your wallet.`)

      const simulation = await publicClient.simulateContract({
        account: address,
        address: protocolAddress,
        abi: PACT_ABI,
        functionName,
        args,
      } as never)

      const hash = await walletClient.writeContract(simulation.request)
      setTxHash(hash)
      setTxStage('confirming')
      setTxLabel(`${label} is waiting for on-chain confirmation on Arc Testnet.`)
      
      await publicClient.waitForTransactionReceipt({ hash })
      setTxStage('success')
      setTxLabel(`${label} successfully confirmed.`)
      toast.success(`${label} confirmed`)
      await refresh()
    } catch (error) {
      const message = transactionErrorMessage(error)
      setTxStage('error')
      setTxError(message)
      toast.error(message)
    } finally {
      setBusyLabel('')
    }
  }

  async function acceptPact() {
    if (!pact) return
    const expectedTermsHash = canonicalTermsHash(pact, protocolAddress, termsInput)
    if (!expectedTermsHash || expectedTermsHash !== pact.termsHash) {
      toast.error('Terms hash mismatch: Paste the exact plaintext terms to verify before accepting.')
      return
    }
    try {
      const permit = pact.amountTaker > 0n
        ? await ensureExactAllowance(pact.tokenTaker as `0x${string}`, pact.amountTaker)
        : null

      await execute(
        permit ? 'acceptPactWithPermit' : 'acceptPact',
        permit
          ? [BigInt(id), expectedTermsHash, permit.deadline, permit.v, permit.r, permit.s]
          : [BigInt(id), expectedTermsHash],
        'Accept pact offer & lock counterparty collateral',
      )
    } catch (error) {
      setBusyLabel('')
      const message = transactionErrorMessage(error)
      setTxStage('error')
      setTxError(message)
      toast.error(message)
    }
  }

  async function openOrRespondDispute(action: 'openDispute' | 'respondDispute') {
    if (!pact) return
    try {
      const permit = await ensureExactAllowance(USDC_ERC20, pact.bondAmount)
      await execute(
        permit ? `${action}WithPermit` : action,
        permit ? [BigInt(id), permit.deadline, permit.v, permit.r, permit.s] : [BigInt(id)],
        action === 'openDispute' ? 'Open bonded dispute' : 'Respond with counter-bond',
      )
    } catch (error) {
      setBusyLabel('')
      const message = transactionErrorMessage(error)
      setTxStage('error')
      setTxError(message)
      toast.error(message)
    }
  }

  if (loading) {
    return (
      <div className="border border-outline-border bg-[#0c0f12] p-12 text-center text-[13px] font-code-hash text-text-muted flex items-center justify-center gap-3">
        <span className="w-2.5 h-2.5 bg-primary-fixed live-dot" />
        READING VERIFIED ON-CHAIN PACT STATE…
      </div>
    )
  }

  if (!protocolAddress) {
    return (
      <div className="border border-status-warning/50 bg-[#0c0f12] p-8">
        <h1 className="font-display-mono text-xl font-bold text-white">Protocol Unavailable</h1>
        <p className="mt-2 text-[13px] text-text-muted">No verified PACT protocol address configured for this network.</p>
        <Link href="/" className="mt-4 inline-block text-primary-fixed underline text-[12px] font-code-hash">← Return to overview</Link>
      </div>
    )
  }

  if (!pact) {
    return (
      <div className="border border-outline-border bg-[#0c0f12] p-8 text-center">
        <h1 className="font-display-mono text-xl font-bold text-white">Pact #{String(id).padStart(4, '0')} Not Found</h1>
        <p className="mt-2 text-[13px] text-text-muted">This pact does not exist on the current Arc Testnet contract.</p>
        <Link href="/" className="mt-4 inline-block text-primary-fixed underline text-[12px] font-code-hash">← Return to overview</Link>
      </div>
    )
  }

  const now = BigInt(Math.floor(Date.now() / 1000))
  const normalizedAddress = address?.toLowerCase()
  const isMaker = normalizedAddress === pact.maker.toLowerCase()
  const isTaker = normalizedAddress === pact.taker.toLowerCase()
  const isArbiter = normalizedAddress === pact.arbiter.toLowerCase()
  const isRespondent = dispute && normalizedAddress === (dispute.opener.toLowerCase() === pact.maker.toLowerCase() ? pact.taker.toLowerCase() : pact.maker.toLowerCase())

  const canAccept = isTaker && pact.status === 0 && now <= pact.offerExpiry
  const canSubmitProof = isTaker && pact.status === 1 && now <= pact.performanceDeadline
  const canRelease = isMaker && (pact.status === 1 || pact.status === 2)
  const canOpenDispute = (isMaker || isTaker) && (pact.status === 1 || pact.status === 2) && now <= pact.disputeDeadline
  const canRespond = Boolean(isRespondent && dispute && dispute.arbiterDeadline === 0n && now <= dispute.responseDeadline)
  const canRule = Boolean(isArbiter && dispute && dispute.arbiterDeadline > 0n && now <= dispute.arbiterDeadline)
  const canDefault = Boolean(dispute && dispute.arbiterDeadline === 0n && now > dispute.responseDeadline)
  const canArbiterTimeout = Boolean(dispute && dispute.arbiterDeadline > 0n && now > dispute.arbiterDeadline)
  const canDeadlineSettle = (pact.status === 0 && now > pact.offerExpiry) || ((pact.status === 1 || pact.status === 2) && now > pact.disputeDeadline)
  const canCancel = isMaker && pact.status === 0
  const busy = Boolean(busyLabel)

  const uniqueTokens = [...new Set([pact.tokenMaker, pact.tokenTaker, USDC_ERC20].filter(token => isAddress(token)))] as `0x${string}`[]
  const pactTerms = toCanonicalTerms(pact, protocolAddress)
  const termsMatch = Boolean(termsInput && pactTerms && verifyPactTerms(pactTerms, termsInput, pact.termsHash as `0x${string}`))

  const copyPactId = () => {
    navigator.clipboard.writeText(String(id))
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-hairline pb-5 animate-enter">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link href="/" className="text-[11px] font-label-caps text-text-muted hover:text-primary-fixed transition-colors">
              ← The Tape
            </Link>
            <span className="text-text-dim">/</span>
            <span className="pact-eyebrow">Agreement Record</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display-mono text-[24px] sm:text-[30px] font-bold text-white tracking-tight">
              Pact #{String(id).padStart(4, '0')}
            </h1>
            <button
              type="button"
              onClick={copyPactId}
              className="px-2 py-0.5 border border-outline-border bg-[#0c0f12] text-[10px] font-label-caps uppercase text-text-muted hover:text-white"
            >
              {copiedId ? 'Copied ✓' : 'Copy ID'}
            </button>
            <span className="px-2.5 py-0.5 border border-outline-border bg-[#12161b] text-[10px] font-label-caps uppercase text-text-muted font-bold">
              {kindLabel(pact.kind)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-code-hash text-[11px]">
          <a
            href={`https://testnet.arcscan.app/address/${protocolAddress}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary-fixed hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">verified</span>
            Verified Contract on ArcScan ↗
          </a>
        </div>
      </header>

      {/* State Machine Lifecycle Progress */}
      <PactStateMachine status={pact.status} />

      {/* Capital & Escrow Vault Card */}
      <section aria-label="Escrow Capital Breakdown" className="border border-outline-border bg-[#0c0f12] p-5 animate-enter">
        <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary-fixed">account_balance</span>
            <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
              Escrow Capital & Custody Vault
            </h2>
          </div>
          <span className="text-[10px] font-code-hash text-emerald-400 font-bold">
            Locked on Arc Network
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-outline-hairline border border-outline-hairline">
          <div className="bg-[#07080a] p-4">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">Maker Collateral</span>
            <span className="font-display-mono text-[18px] font-bold text-primary-fixed mt-1 block">
              {formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)}
            </span>
            <span className="text-[10px] text-text-dim mt-0.5 block">Locked upon offer creation</span>
          </div>

          <div className="bg-[#07080a] p-4">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">Counterparty Collateral</span>
            <span className="font-display-mono text-[18px] font-bold text-white mt-1 block">
              {pact.amountTaker > 0n ? `${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}` : 'None (0.00)'}
            </span>
            <span className="text-[10px] text-text-dim mt-0.5 block">
              {pact.status === 0 ? 'Pending acceptance' : 'Escrowed'}
            </span>
          </div>

          <div className="bg-[#07080a] p-4">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">Dispute Bond (5%)</span>
            <span className="font-display-mono text-[18px] font-bold text-amber-400 mt-1 block">
              {formatAmount(pact.bondAmount)} USDC
            </span>
            <span className="text-[10px] text-text-dim mt-0.5 block">Refunded to winner</span>
          </div>

          <div className="bg-[#07080a] p-4">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">Arbiter Fee Cap</span>
            <span className="font-display-mono text-[18px] font-bold text-text-muted mt-1 block">
              {formatAmount(pact.arbiterFeeCap)} USDC
            </span>
            <span className="text-[10px] text-text-dim mt-0.5 block">Max mediator fee</span>
          </div>
        </div>
      </section>

      {/* Participants Matrix (Maker, Counterparty, Arbiter) */}
      <section aria-label="Pact Participants" className="grid gap-3 sm:grid-cols-3 animate-enter">
        {/* Maker Card */}
        <div className={`p-4 border bg-[#0c0f12] flex flex-col justify-between ${isMaker ? 'border-primary-fixed/50 ring-1 ring-primary-fixed/20' : 'border-outline-border'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">Maker (Creator)</span>
              {isMaker && <span className="px-1.5 py-0.5 bg-primary-fixed text-black font-label-caps text-[9px] font-bold uppercase">You</span>}
            </div>
            <p className="font-code-hash text-[13px] font-bold text-white break-all">{truncateAddress(pact.maker)}</p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-hairline/60 flex items-center justify-between text-[11px] font-code-hash">
            <span className="text-primary-fixed">{formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)}</span>
            <a href={`https://testnet.arcscan.app/address/${pact.maker}`} target="_blank" rel="noreferrer" className="text-text-dim hover:text-primary-fixed">ArcScan ↗</a>
          </div>
        </div>

        {/* Counterparty Card */}
        <div className={`p-4 border bg-[#0c0f12] flex flex-col justify-between ${isTaker ? 'border-primary-fixed/50 ring-1 ring-primary-fixed/20' : 'border-outline-border'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">Counterparty (Taker)</span>
              {isTaker && <span className="px-1.5 py-0.5 bg-primary-fixed text-black font-label-caps text-[9px] font-bold uppercase">You</span>}
            </div>
            <p className="font-code-hash text-[13px] font-bold text-white break-all">{truncateAddress(pact.taker)}</p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-hairline/60 flex items-center justify-between text-[11px] font-code-hash">
            <span className="text-white">{pact.amountTaker > 0n ? `${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}` : '0 Collateral'}</span>
            <a href={`https://testnet.arcscan.app/address/${pact.taker}`} target="_blank" rel="noreferrer" className="text-text-dim hover:text-primary-fixed">ArcScan ↗</a>
          </div>
        </div>

        {/* Arbiter Card */}
        <div className={`p-4 border bg-[#0c0f12] flex flex-col justify-between ${isArbiter ? 'border-primary-fixed/50 ring-1 ring-primary-fixed/20' : 'border-outline-border'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">Designated Arbiter</span>
              {isArbiter && <span className="px-1.5 py-0.5 bg-primary-fixed text-black font-label-caps text-[9px] font-bold uppercase">You</span>}
            </div>
            <p className="font-code-hash text-[13px] font-bold text-white break-all">{truncateAddress(pact.arbiter)}</p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-hairline/60 flex items-center justify-between text-[11px] font-code-hash">
            <span className="text-text-muted">Fee Cap: {formatAmount(pact.arbiterFeeCap)} USDC</span>
            <a href={`https://testnet.arcscan.app/address/${pact.arbiter}`} target="_blank" rel="noreferrer" className="text-text-dim hover:text-primary-fixed">ArcScan ↗</a>
          </div>
        </div>
      </section>

      {/* Deadlines & Time Windows */}
      <section aria-label="Committed Deadlines" className="border border-outline-border bg-[#0c0f12] p-5 animate-enter">
        <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary-fixed">schedule</span>
            <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
              Committed Deadlines & Cutoffs
            </h2>
          </div>
          {!isTerminal(pact.status) && (
            <Countdown deadlineTs={pact.status === 0 ? pact.offerExpiry : pact.disputeDeadline} />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 font-code-hash text-[12px]">
          <div className="p-3 border border-outline-hairline bg-[#07080a]">
            <span className="text-[10px] font-label-caps uppercase text-text-muted block">Offer Expiry</span>
            <span className="text-white font-bold block mt-1">{formatDate(pact.offerExpiry)}</span>
            <span className="text-[10px] text-text-dim mt-0.5 block">Acceptance deadline</span>
          </div>

          <div className="p-3 border border-outline-hairline bg-[#07080a]">
            <span className="text-[10px] font-label-caps uppercase text-text-muted block">Performance Deadline</span>
            <span className="text-white font-bold block mt-1">{formatDate(pact.performanceDeadline)}</span>
            <span className="text-[10px] text-text-dim mt-0.5 block">Delivery / work proof window</span>
          </div>

          <div className="p-3 border border-outline-hairline bg-[#07080a]">
            <span className="text-[10px] font-label-caps uppercase text-text-muted block">Dispute Window Cutoff</span>
            <span className="text-white font-bold block mt-1">{formatDate(pact.disputeDeadline)}</span>
            <span className="text-[10px] text-text-dim mt-0.5 block">Final settlement cutoff</span>
          </div>
        </div>
      </section>

      {/* Written Terms & SHA-256 Verifier */}
      <section aria-label="Written Terms Verification" className="border border-outline-border bg-[#0c0f12] p-5 animate-enter">
        <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary-fixed">fingerprint</span>
            <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
              Cryptographic Terms Hash
            </h2>
          </div>
          <span className="text-[10px] font-code-hash text-text-dim">SHA-256 On-Chain Anchor</span>
        </div>

        <div className="p-3 border border-outline-hairline bg-[#07080a] font-code-hash text-[11px] text-primary-fixed break-all">
          {pact.termsHash}
        </div>

        <div className="mt-4">
          <label htmlFor="terms-verify-input" className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
            Verify Written Plaintext Terms Locally
          </label>
          <textarea
            id="terms-verify-input"
            value={termsInput}
            onChange={e => setTermsInput(e.target.value)}
            rows={4}
            placeholder="Paste the written agreement plaintext to verify cryptographic match against on-chain termsHash before accepting..."
            className="w-full border border-outline-border bg-[#07080a] p-3 text-[12px] font-code-hash text-white outline-none focus:border-primary-fixed resize-y"
          />
          <div className="mt-2 flex items-center justify-between text-[11px] font-code-hash">
            <span className={termsMatch ? 'text-emerald-400 font-bold' : 'text-text-dim'}>
              {termsMatch
                ? '✓ Cryptographic Match: Plaintext and all on-chain economic terms match byte-for-byte.'
                : 'Paste agreement text to confirm hash match.'}
            </span>
          </div>
        </div>
      </section>

      {/* Active Dispute Banner (if disputed) */}
      {dispute && (
        <section className="border border-amber-500/60 bg-amber-950/20 p-5 animate-enter">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-400 text-[20px]">gavel</span>
            <h2 className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-amber-300">
              Dispute Active & Bonded
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-[12px] font-code-hash text-text-muted">
            <div className="p-3 bg-[#07080a] border border-outline-hairline">
              <span className="text-[10px] uppercase text-text-dim block">Dispute Opener</span>
              <span className="text-white font-bold">{truncateAddress(dispute.opener)}</span>
            </div>
            <div className="p-3 bg-[#07080a] border border-outline-hairline">
              <span className="text-[10px] uppercase text-text-dim block">Claim Type</span>
              <span className="text-amber-400 font-bold">{dispute.claim === 1 ? 'Maker Claim (Refund All)' : 'Taker Claim (Release All)'}</span>
            </div>
            <div className="p-3 bg-[#07080a] border border-outline-hairline">
              <span className="text-[10px] uppercase text-text-dim block">Response Deadline</span>
              <span className="text-white">{formatDate(dispute.responseDeadline)}</span>
            </div>
            <div className="p-3 bg-[#07080a] border border-outline-hairline">
              <span className="text-[10px] uppercase text-text-dim block">Arbiter Ruling Deadline</span>
              <span className="text-white">{dispute.arbiterDeadline ? formatDate(dispute.arbiterDeadline) : 'Awaiting Counterparty Bond'}</span>
            </div>
          </div>
        </section>
      )}

      {/* Contextual Action Hub (Role & State Based CTAs) */}
      {isConnected && !isTerminal(pact.status) && (
        <section aria-label="Action Execution Panel" className="border border-primary-fixed/40 bg-[#0c0f12] p-5 space-y-4 animate-enter">
          <div className="flex items-center justify-between pb-3 border-b border-outline-hairline">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-fixed text-[18px]">bolt</span>
              <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
                Contextual Execution Hub
              </h2>
            </div>
            <span className="text-[10px] font-label-caps uppercase text-text-dim">Role-Aware Triggers</span>
          </div>

          {/* Counterparty: Accept Offer */}
          {canAccept && (
            <div className="space-y-2">
              <p className="text-[12px] font-body-sans text-text-muted">
                You are the designated counterparty. Verify terms above, then sign to lock any required collateral and activate the pact.
              </p>
              <button
                type="button"
                disabled={busy || !termsMatch}
                onClick={acceptPact}
                className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider disabled:opacity-40"
              >
                {termsMatch ? 'Verify Terms & Accept Pact Offer' : 'Paste Matching Plaintext Terms to Enable Acceptance'}
              </button>
            </div>
          )}

          {/* Counterparty: Submit Proof */}
          {canSubmitProof && (
            <div className="space-y-2">
              <p className="text-[12px] font-body-sans text-text-muted">
                Submit delivery tracking reference, IPFS CID, or completion hash before the performance window closes.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={proofInput}
                  onChange={e => setProofInput(e.target.value)}
                  placeholder="Proof reference / tracking ID / deliverable link…"
                  className="flex-1 border border-outline-border bg-[#07080a] px-3 py-2 text-[12px] font-code-hash text-white outline-none focus:border-primary-fixed"
                />
                <button
                  type="button"
                  disabled={busy || !proofInput}
                  onClick={() => execute('submitProof', [BigInt(id), hashTerms(proofInput)], 'Submit Proof')}
                  className="pact-button-primary min-h-[44px] px-5 text-[11px] font-bold uppercase tracking-wider shrink-0 disabled:opacity-40"
                >
                  Submit Proof Hash
                </button>
              </div>
            </div>
          )}

          {/* Maker: Release Collateral */}
          {canRelease && (
            <div className="space-y-2">
              <p className="text-[12px] font-body-sans text-text-muted">
                Once satisfied with delivery, release locked escrow funds directly to the counterparty.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => execute('release', [BigInt(id)], 'Release collateral to counterparty')}
                className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
              >
                Release Collateral to Counterparty
              </button>
            </div>
          )}

          {/* Dispute: Open Dispute */}
          {canOpenDispute && (
            <div className="pt-2 border-t border-outline-hairline">
              <button
                type="button"
                disabled={busy}
                onClick={() => openOrRespondDispute('openDispute')}
                className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase tracking-wider text-amber-400 hover:border-amber-400"
              >
                Open Bonded Dispute ({formatAmount(pact.bondAmount)} USDC Bond)
              </button>
            </div>
          )}

          {/* Dispute: Counter-Bond Response */}
          {canRespond && (
            <div className="space-y-2">
              <p className="text-[12px] font-body-sans text-amber-300">
                A dispute was opened against this pact. Post your matching bond to contest the claim before mediator arbitration.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => openOrRespondDispute('respondDispute')}
                className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
              >
                Post Counter-Bond & Contest Dispute
              </button>
            </div>
          )}

          {/* Arbiter: Issue Ruling */}
          {canRule && (
            <div className="space-y-3 p-4 border border-outline-hairline bg-[#07080a]">
              <p className="text-[12px] font-headline-mono font-bold uppercase text-white">
                Arbiter Decision Panel
              </p>
              <div>
                <label className="block text-[11px] font-label-caps uppercase text-text-muted mb-1">
                  Arbiter Fee to Deduct (USDC, max {formatAmount(pact.arbiterFeeCap)})
                </label>
                <input
                  value={feeInput}
                  onChange={e => setFeeInput(e.target.value)}
                  className="w-full border border-outline-border bg-[#0c0f12] px-3 py-2 text-[12px] font-code-hash text-white outline-none focus:border-primary-fixed"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => execute('ruleDispute', [BigInt(id), 1, parseUnitsSafe(feeInput)], 'Rule for Maker')}
                  className="pact-button-primary min-h-[44px] text-[11px] font-bold uppercase"
                >
                  Rule for Maker (Refund)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => execute('ruleDispute', [BigInt(id), 2, parseUnitsSafe(feeInput)], 'Rule for Taker')}
                  className="pact-button-primary min-h-[44px] text-[11px] font-bold uppercase"
                >
                  Rule for Taker (Release)
                </button>
              </div>
            </div>
          )}

          {/* Timeouts & Fallbacks */}
          {canDefault && (
            <button
              type="button"
              disabled={busy}
              onClick={() => execute('resolveUnansweredDispute', [BigInt(id)], 'Execute default judgment')}
              className="pact-button-primary w-full min-h-[44px] text-[11px] font-bold uppercase"
            >
              Execute Default Judgment (Unanswered Dispute)
            </button>
          )}

          {canArbiterTimeout && (
            <button
              type="button"
              disabled={busy}
              onClick={() => execute('arbiterTimeout', [BigInt(id)], 'Execute arbiter timeout')}
              className="pact-button-primary w-full min-h-[44px] text-[11px] font-bold uppercase"
            >
              Refund Bonds & Split Collateral 50/50 (Arbiter Timeout)
            </button>
          )}

          {canDeadlineSettle && (
            <button
              type="button"
              disabled={busy}
              onClick={() => execute('refundAfterDeadline', [BigInt(id)], 'Settle after deadline')}
              className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase"
            >
              Settle & Credit Refunds After Deadline Cutoff
            </button>
          )}

          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => execute('cancelPact', [BigInt(id)], 'Cancel unaccepted offer')}
              className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase text-text-muted hover:text-white"
            >
              Cancel Offer & Credit Maker Collateral Refund
            </button>
          )}
        </section>
      )}

      {/* Claimable Escrow Credits Panel */}
      {Object.values(credits).some(value => value > 0n) && (
        <section className="border border-emerald-500/40 bg-emerald-950/20 p-5 animate-enter">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-emerald-400 text-[20px]">account_balance_wallet</span>
            <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-emerald-300">
              Claimable Escrow Credits Available
            </h2>
          </div>
          <div className="space-y-2">
            {uniqueTokens.map(token => credits[token] > 0n && (
              <button
                key={token}
                disabled={busy}
                onClick={() => execute('withdraw', [token], `Withdraw ${tokenSymbol(token)}`)}
                className="pact-button-primary flex w-full justify-between items-center px-4 py-3 min-h-[44px]"
              >
                <span>Withdraw {tokenSymbol(token)} to Wallet</span>
                <span className="font-bold">{formatAmount(credits[token])} {tokenSymbol(token)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <TransactionProgress
        stage={txStage}
        label={txLabel || busyLabel}
        hash={txHash}
        error={txError}
        onDismiss={() => {
          setTxStage('idle')
          setTxError('')
          setTxHash(null)
        }}
      />
    </div>
  )
}

function parseUnitsSafe(value: string): bigint {
  try {
    return BigInt(Math.round(Number(value || 0) * 1_000_000))
  } catch {
    return 0n
  }
}

function toCanonicalTerms(pact: PactData, pactAddress: `0x${string}` | null) {
  if (!pactAddress) return null
  return {
    pactAddress,
    chainId: BigInt(arcTestnet.id),
    maker: pact.maker as `0x${string}`,
    taker: pact.taker as `0x${string}`,
    arbiter: pact.arbiter as `0x${string}`,
    tokenMaker: pact.tokenMaker as `0x${string}`,
    tokenTaker: pact.tokenTaker as `0x${string}`,
    amountMaker: pact.amountMaker,
    amountTaker: pact.amountTaker,
    notionalUSDC: pact.notionalUSDC,
    arbiterFeeCap: pact.arbiterFeeCap,
    offerExpiry: pact.offerExpiry,
    performanceDeadline: pact.performanceDeadline,
    disputeDeadline: pact.disputeDeadline,
    kind: pact.kind,
    blurSize: pact.blurSize,
  }
}

function canonicalTermsHash(pact: PactData, pactAddress: `0x${string}` | null, plaintext: string) {
  const canonical = toCanonicalTerms(pact, pactAddress)
  return canonical && plaintext ? hashPactTerms(canonical, plaintext) : null
}
