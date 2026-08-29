'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { formatUnits, isAddress } from 'viem'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { useModal } from 'connectkit'
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
import ActionConfirmModal from '../../../components/ActionConfirmModal'
import RoleBadge, { type RoleType } from '../../../components/RoleBadge'
import PartyCard from '../../../components/PartyCard'
import TermsVerifier from '../../../components/TermsVerifier'
import PageSkeleton from '../../../components/PageSkeleton'
import AdvancedDetails from '../../../components/AdvancedDetails'
import ProtocolTerm from '../../../components/ProtocolTerm'
import { transactionErrorMessage } from '../../../lib/transactionErrors'
import { evaluatePactActions, getPrimaryUserAction, type PactAction, type DisputeData } from '../../../lib/actionMatrix'

function getStatusStyle(status: number) {
  switch (status) {
    case 0:
      return 'text-sky-400 border border-sky-500/40 bg-sky-950/25 font-bold'
    case 1:
      return 'text-primary-fixed border border-primary-fixed/40 bg-primary-fixed/10 font-bold'
    case 2:
      return 'text-purple-300 border border-purple-500/40 bg-purple-950/25 font-bold'
    case 3:
      return 'text-amber-400 border border-amber-500/40 bg-amber-950/30 font-bold'
    case 4:
      return 'text-emerald-400 border border-emerald-500/40 bg-emerald-950/25 font-bold'
    case 5:
      return 'text-zinc-400 border border-zinc-700/40 bg-zinc-900/30 font-bold'
    case 6:
      return 'text-rose-400 border border-rose-500/40 bg-rose-950/25 font-bold'
    default:
      return 'text-slate-400 border border-slate-700/40 bg-slate-900/30 font-bold'
  }
}

function statusLabel(status: number): string {
  switch (status) {
    case 0: return 'OFFERED'
    case 1: return 'ACTIVE'
    case 2: return 'PROOF SUBMITTED'
    case 3: return 'DISPUTED'
    case 4: return 'SETTLED & CLEARED'
    case 5: return 'CANCELLED'
    case 6: return 'EXPIRED'
    default: return 'UNKNOWN'
  }
}

export default function PactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const id = Number(idParam)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { setOpen: openWalletModal } = useModal()
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

  // Pre-Flight Confirmation Modal State
  const [confirmAction, setConfirmAction] = useState<PactAction | null>(null)
  const [confirmCallback, setConfirmCallback] = useState<(() => Promise<void>) | null>(null)
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false)

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
        setDispute({
          opener: value.opener as `0x${string}`,
          claim: Number(value.claim),
          makerBond: value.makerBond,
          takerBond: value.takerBond,
          openedAt: value.openedAt,
          responseDeadline: value.responseDeadline,
          arbiterDeadline: value.arbiterDeadline,
        })
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

  function requestActionConfirmation(action: PactAction, callback: () => Promise<void>) {
    setConfirmAction(action)
    setConfirmCallback(() => callback)
  }

  async function handleConfirmModalSubmit() {
    if (!confirmCallback) return
    setIsSubmittingConfirm(true)
    try {
      await confirmCallback()
      setConfirmAction(null)
      setConfirmCallback(null)
    } finally {
      setIsSubmittingConfirm(false)
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
        'Accept pact offer as Counterparty',
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
    return <PageSkeleton variant="detail" />
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
  const isMaker = Boolean(normalizedAddress && normalizedAddress === pact.maker.toLowerCase())
  const isTaker = Boolean(normalizedAddress && normalizedAddress === pact.taker.toLowerCase())
  const isArbiter = Boolean(normalizedAddress && normalizedAddress === pact.arbiter.toLowerCase())
  const isRespondent = Boolean(dispute && normalizedAddress && normalizedAddress === (dispute.opener.toLowerCase() === pact.maker.toLowerCase() ? pact.taker.toLowerCase() : pact.maker.toLowerCase()))

  const userRoleType: RoleType = isMaker ? 'MAKER' : isTaker ? 'TAKER' : isArbiter ? 'ARBITER' : 'OBSERVER'

  const pactTerms = toCanonicalTerms(pact, protocolAddress)
  const termsMatch = Boolean(termsInput && pactTerms && verifyPactTerms(pactTerms, termsInput, pact.termsHash as `0x${string}`))
  const canOpenDispute = (isMaker || isTaker) && (pact.status === 1 || pact.status === 2) && now <= pact.disputeDeadline
  const canRespond = Boolean(isRespondent && dispute && dispute.arbiterDeadline === 0n && now <= dispute.responseDeadline)
  const canRule = Boolean(isArbiter && dispute && dispute.arbiterDeadline > 0n && now <= dispute.arbiterDeadline)
  const canDefault = Boolean(dispute && dispute.arbiterDeadline === 0n && now > dispute.responseDeadline)
  const canArbiterTimeout = Boolean(dispute && dispute.arbiterDeadline > 0n && now > dispute.arbiterDeadline)
  const busy = Boolean(busyLabel)

  // Evaluate matrix actions for the current state
  const availableActions = evaluatePactActions(pact, dispute, address, now, {
    termsMatched: termsMatch,
    hasProofInput: Boolean(proofInput.trim()),
  })

  const primaryAction = getPrimaryUserAction(pact, dispute, address, now)
  const uniqueTokens = [...new Set([pact.tokenMaker, pact.tokenTaker, USDC_ERC20].filter(token => isAddress(token)))] as `0x${string}`[]
  const hasWithdrawableCredits = Object.values(credits).some(v => v > 0n)

  const copyPactId = () => {
    navigator.clipboard.writeText(String(id))
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  return (
    <div className="w-full space-y-6 pb-20 md:pb-8">
      
      {/* ========================================================================= */}
      {/* 1. HERO HEADER & STATUS BADGE */}
      {/* ========================================================================= */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-hairline pb-5 animate-enter">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link href="/" className="text-[11px] font-label-caps text-text-muted hover:text-primary-fixed transition-colors">
              ← The Tape
            </Link>
            <span className="text-text-dim">/</span>
            <span className="pact-eyebrow">Agreement Record</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display-mono text-[26px] sm:text-[32px] font-bold text-white tracking-tight">
              Pact #{String(id).padStart(4, '0')}
            </h1>
            <button
              type="button"
              onClick={copyPactId}
              className="px-2 py-0.5 border border-outline-border bg-[#0c0f12] text-[10px] font-label-caps uppercase text-text-muted hover:text-white transition-colors"
            >
              {copiedId ? 'Copied ✓' : 'Copy ID'}
            </button>
            <span className={`px-2.5 py-0.5 text-[10px] font-label-caps uppercase font-bold tracking-wider ${getStatusStyle(pact.status)}`}>
              {statusLabel(pact.status)}
            </span>
            <span className="px-2.5 py-0.5 border border-outline-border bg-[#12161b] text-[10px] font-label-caps uppercase text-text-muted font-bold">
              {kindLabel(pact.kind)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 font-code-hash text-[11px] flex-wrap">
          <a
            href={`https://testnet.arcscan.app/address/${protocolAddress}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary-fixed hover:underline flex items-center gap-1 font-bold"
          >
            <span className="material-symbols-outlined text-[14px]">verified</span>
            Verified Arc Contract ↗
          </a>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. USER ROLE & IMMEDIATE NEXT ACTION HERO BANNER */}
      {/* ========================================================================= */}
      <section aria-label="User Role and Next Action" className="border border-outline-border bg-[#0c0f12] p-4 sm:p-5 animate-enter">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="shrink-0">
              <RoleBadge role={userRoleType} isCurrentUser={isMaker || isTaker || isArbiter} size="md" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-white font-headline-mono">
                {isMaker
                  ? 'Your Role: Maker (Deal Creator & Depositor)'
                  : isTaker
                  ? 'Your Role: Designated Counterparty (Taker)'
                  : isArbiter
                  ? 'Your Role: Designated Arbiter (Mediator)'
                  : 'Viewing Mode: Observer (Third-Party)'}
              </p>
              <p className="text-[11px] font-body-sans text-text-muted mt-0.5 max-w-xl leading-5">
                {isMaker
                  ? `You locked ${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)} in escrow for counterparty ${truncateAddress(pact.taker)}.`
                  : isTaker
                  ? `Maker ${truncateAddress(pact.maker)} offered ${formatAmount(pact.amountMaker)} ${tokenSymbol(pact.tokenMaker)} for fulfillment.`
                  : isArbiter
                  ? `You are assigned to evaluate evidence and rule if a dispute is bonded.`
                  : `This agreement is managed by Maker ${truncateAddress(pact.maker)} and Taker ${truncateAddress(pact.taker)}.`}
              </p>
            </div>
          </div>

          {primaryAction && primaryAction.isEligible && (
            <div className="shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-fixed text-[#090b0d] font-bold text-[11px] font-label-caps uppercase tracking-wider rounded-sm shadow-[0_0_15px_rgba(243,232,140,0.2)] animate-pulse">
                <span>⚡ Recommended Action: {primaryAction.shortLabel}</span>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. LIFECYCLE PROGRESS STEPPER */}
      {/* ========================================================================= */}
      <PactStateMachine
        status={pact.status}
        offerExpiry={pact.offerExpiry}
        disputeDeadline={pact.disputeDeadline}
      />

      {/* ========================================================================= */}
      {/* 4. ESCROW CAPITAL VAULT VS CLAIMABLE CREDITS */}
      {/* ========================================================================= */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active Escrow Custody (2 cols) */}
        <section aria-label="Escrow Capital Breakdown" className="lg:col-span-2 border border-outline-border bg-[#0c0f12] p-5 animate-enter flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary-fixed">account_balance</span>
                <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
                  Escrow Capital & Custody Vault
                </h2>
              </div>
              <span className="text-[10px] font-code-hash text-emerald-400 font-bold">
                {isTerminal(pact.status) ? 'Escrow Cleared' : 'Locked on Arc Network'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-outline-hairline border border-outline-hairline">
              <div className="bg-[#07080a] p-3.5">
                <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
                  <ProtocolTerm term="COLLATERAL">Maker Collateral</ProtocolTerm>
                </span>
                <span className="font-display-mono text-[16px] sm:text-[18px] font-bold text-primary-fixed mt-1 block">
                  {formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)}
                </span>
                <span className="text-[10px] text-text-dim mt-0.5 block">Locked in contract</span>
              </div>

              <div className="bg-[#07080a] p-3.5">
                <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
                  <ProtocolTerm term="COLLATERAL">Taker Collateral</ProtocolTerm>
                </span>
                <span className="font-display-mono text-[16px] sm:text-[18px] font-bold text-white mt-1 block">
                  {pact.amountTaker > 0n ? `${formatAmount(pact.amountTaker)} ${tokenSymbol(pact.tokenTaker)}` : 'None (0.00)'}
                </span>
                <span className="text-[10px] text-text-dim mt-0.5 block">
                  {pact.status === 0 ? 'Pending acceptance' : 'Escrowed'}
                </span>
              </div>

              <div className="bg-[#07080a] p-3.5">
                <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
                  <ProtocolTerm term="DISPUTE_BOND">Dispute Bond (5%)</ProtocolTerm>
                </span>
                <span className="font-display-mono text-[16px] sm:text-[18px] font-bold text-amber-400 mt-1 block">
                  {formatAmount(pact.bondAmount)} USDC
                </span>
                <span className="text-[10px] text-text-dim mt-0.5 block">Refunded to winner</span>
              </div>

              <div className="bg-[#07080a] p-3.5">
                <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted block">
                  <ProtocolTerm term="ARBITER_FEE_CAP">Arbiter Fee Cap</ProtocolTerm>
                </span>
                <span className="font-display-mono text-[16px] sm:text-[18px] font-bold text-text-muted mt-1 block">
                  {formatAmount(pact.arbiterFeeCap)} USDC
                </span>
                <span className="text-[10px] text-text-dim mt-0.5 block">Max mediator fee</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-[11px] text-text-dim font-body-sans border-t border-outline-hairline/40 pt-2.5">
            🔒 <strong>Strict Escrow Guarantee:</strong> Collateral cannot be moved arbitrarily. Funds only transition via mutual agreement, verified proof completion, or bonded arbitration.
          </p>
        </section>

        {/* Claimable Pull-Payment Credits Vault (1 col) */}
        <section aria-label="Withdrawable Credits" className={`border p-5 animate-enter flex flex-col justify-between ${
          hasWithdrawableCredits
            ? 'border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_20px_rgba(52,211,153,0.1)]'
            : 'border-outline-border bg-[#0c0f12]'
        }`}>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-3">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[18px] ${hasWithdrawableCredits ? 'text-emerald-400' : 'text-text-muted'}`}>
                  account_balance_wallet
                </span>
                <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
                  Pull Credits
                </h2>
              </div>
              <span className={`text-[10px] font-label-caps uppercase font-bold ${hasWithdrawableCredits ? 'text-emerald-400' : 'text-text-dim'}`}>
                {hasWithdrawableCredits ? 'Available Now' : 'Zero Balance'}
              </span>
            </div>

            <p className="text-[11px] leading-5 text-text-muted font-body-sans mb-3">
              Refunds and settlements are safely credited to your internal escrow account. Withdraw anytime to your wallet.
            </p>

            {hasWithdrawableCredits ? (
              <div className="space-y-2">
                {uniqueTokens.map(token => credits[token] > 0n && (
                  <button
                    key={token}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const withdrawAction: PactAction = {
                        type: 'WITHDRAW_CREDITS',
                        label: `Withdraw ${formatAmount(credits[token])} ${tokenSymbol(token)} to Wallet`,
                        shortLabel: `Withdraw ${tokenSymbol(token)}`,
                        functionName: 'withdraw',
                        role: 'PUBLIC',
                        severity: 'primary',
                        isDangerous: false,
                        isEligible: true,
                        description: `Transfer internal escrow pull-payment credits directly into your connected wallet address (${truncateAddress(address || '')}).`,
                        financialSummary: {
                          amount: credits[token],
                          token: token,
                          recipient: address || '',
                          recipientRole: 'Connected Wallet',
                        },
                      }
                      requestActionConfirmation(withdrawAction, () => execute('withdraw', [token], `Withdraw ${tokenSymbol(token)}`))
                    }}
                    className="pact-button-primary flex w-full justify-between items-center px-3.5 py-2.5 min-h-[44px]"
                  >
                    <span className="text-[11px] font-bold uppercase">Withdraw {tokenSymbol(token)}</span>
                    <span className="font-bold font-code-hash text-[13px]">{formatAmount(credits[token])} {tokenSymbol(token)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 border border-outline-hairline bg-[#07080a] text-center font-code-hash text-[11px] text-text-dim">
                No withdrawable balance for connected wallet.
              </div>
            )}
          </div>

          <span className="text-[10px] text-text-dim font-code-hash mt-3 block pt-2 border-t border-outline-hairline/40">
            Pull-over-push pattern prevents re-entrancy risks.
          </span>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* 5. COMMITTED DEADLINES & COUNTDOWNS */}
      {/* ========================================================================= */}
      <section aria-label="Committed Deadlines" className="border border-outline-border bg-[#0c0f12] p-5 animate-enter">
        <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary-fixed">schedule</span>
            <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
              Committed Deadlines & Urgency Cutoffs
            </h2>
          </div>
          <span className="text-[10px] font-code-hash text-text-dim">EVM Block Timestamps</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 font-code-hash text-[12px]">
          <div className={`p-3.5 border bg-[#07080a] flex flex-col justify-between ${
            pact.status === 0 ? 'border-primary-fixed/40 ring-1 ring-primary-fixed/20' : 'border-outline-hairline'
          }`}>
            <div>
              <span className="text-[10px] font-label-caps uppercase text-text-muted block">1. Offer Expiry</span>
              <span className="text-white font-bold block mt-1">{formatDate(pact.offerExpiry)}</span>
              <span className="text-[10px] text-text-dim mt-0.5 block">Acceptance cutoff window</span>
            </div>
            {pact.status === 0 && (
              <div className="mt-3 pt-2.5 border-t border-outline-hairline/40">
                <Countdown deadlineTs={pact.offerExpiry} compact showLabel={false} />
              </div>
            )}
          </div>

          <div className={`p-3.5 border bg-[#07080a] flex flex-col justify-between ${
            pact.status === 1 ? 'border-primary-fixed/40 ring-1 ring-primary-fixed/20' : 'border-outline-hairline'
          }`}>
            <div>
              <span className="text-[10px] font-label-caps uppercase text-text-muted block">2. Performance Deadline</span>
              <span className="text-white font-bold block mt-1">{formatDate(pact.performanceDeadline)}</span>
              <span className="text-[10px] text-text-dim mt-0.5 block">Delivery / work proof cutoff</span>
            </div>
            {pact.status === 1 && (
              <div className="mt-3 pt-2.5 border-t border-outline-hairline/40">
                <Countdown deadlineTs={pact.performanceDeadline} compact showLabel={false} />
              </div>
            )}
          </div>

          <div className={`p-3.5 border bg-[#07080a] flex flex-col justify-between ${
            pact.status === 2 || pact.status === 3 ? 'border-primary-fixed/40 ring-1 ring-primary-fixed/20' : 'border-outline-hairline'
          }`}>
            <div>
              <span className="text-[10px] font-label-caps uppercase text-text-muted block">3. Dispute Window Cutoff</span>
              <span className="text-white font-bold block mt-1">{formatDate(pact.disputeDeadline)}</span>
              <span className="text-[10px] text-text-dim mt-0.5 block">Final settlement cutoff</span>
            </div>
            {(pact.status === 1 || pact.status === 2 || pact.status === 3) && (
              <div className="mt-3 pt-2.5 border-t border-outline-hairline/40">
                <Countdown deadlineTs={pact.disputeDeadline} compact showLabel={false} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. PARTICIPANTS & ARBITRATION MATRIX */}
      {/* ========================================================================= */}
      <section aria-label="Pact Participants" className="grid gap-4 sm:grid-cols-3 animate-enter">
        <PartyCard
          role="MAKER"
          address={pact.maker}
          isCurrentUser={isMaker}
          collateralAmount={pact.amountMaker}
          tokenAddress={pact.tokenMaker}
        />
        <PartyCard
          role="TAKER"
          address={pact.taker}
          isCurrentUser={isTaker}
          collateralAmount={pact.amountTaker}
          tokenAddress={pact.tokenTaker}
        />
        <PartyCard
          role="ARBITER"
          address={pact.arbiter}
          isCurrentUser={isArbiter}
          feeCap={pact.arbiterFeeCap}
        />
      </section>

      {/* ========================================================================= */}
      {/* 7. CONTEXTUAL EXECUTION HUB (ACTIONS & TRIGGERS) */}
      {/* ========================================================================= */}
      {!isTerminal(pact.status) && (
        <section aria-label="Action Execution Panel" className="border border-primary-fixed/40 bg-[#0c0f12] p-5 space-y-4 animate-enter shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-outline-hairline">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-fixed text-[18px]">bolt</span>
              <h2 className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">
                Contextual Execution Hub
              </h2>
            </div>
            <span className="text-[10px] font-label-caps uppercase text-text-dim">Role & State Guarded</span>
          </div>

          {!isConnected ? (
            <div className="p-5 border border-outline-hairline bg-[#07080a] text-center space-y-3">
              <p className="text-[12px] font-body-sans text-text-muted">
                Connect your Arc Network wallet to execute role-specific actions (Accept Offer, Submit Proof, Release Funds, or Open Dispute).
              </p>
              <button
                type="button"
                onClick={() => openWalletModal(true)}
                className="pact-button-primary min-h-[42px] px-6 text-[11px] font-bold uppercase tracking-wider"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* STATUS 0: OFFERED (Before Expiry) */}
              {pact.status === 0 && now <= pact.offerExpiry && (
                <div className="space-y-3">
                  {isTaker && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-body-sans text-text-muted">
                        You are the designated counterparty. Paste matching written terms in the verifier below, then confirm acceptance to lock any required collateral and activate the agreement.
                      </p>
                      <button
                        type="button"
                        disabled={busy || !termsMatch}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'ACCEPT_OFFER')
                          if (action) requestActionConfirmation(action, acceptPact)
                          else void acceptPact()
                        }}
                        className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider disabled:opacity-40"
                      >
                        {termsMatch ? 'Verify Terms & Accept Pact as Counterparty' : 'Paste Matching Plaintext Terms to Enable Acceptance'}
                      </button>
                      {!termsMatch && (
                        <p className="text-[11px] font-code-hash text-amber-300">
                          ℹ️ Acceptance requires byte-for-byte verification of written terms against the on-chain hash.
                        </p>
                      )}
                    </div>
                  )}

                  {isMaker && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-body-sans text-text-muted">
                        Offer is pending counterparty acceptance. You can cancel at any time before acceptance to reclaim your collateral.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'CANCEL_OFFER')
                          if (action) {
                            requestActionConfirmation(action, () => execute('cancelPact', [BigInt(id)], 'Cancel unaccepted offer'))
                          } else {
                            void execute('cancelPact', [BigInt(id)], 'Cancel unaccepted offer')
                          }
                        }}
                        className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase text-rose-300 hover:text-rose-200 border-rose-500/30 hover:border-rose-400"
                      >
                        Cancel Offer as Maker & Reclaim Escrow Collateral
                      </button>
                    </div>
                  )}

                  {!isMaker && !isTaker && (
                    <div className="p-3.5 border border-outline-hairline bg-[#07080a] text-[12px] text-text-dim font-code-hash">
                      Offer is pending acceptance by counterparty {truncateAddress(pact.taker)} before {formatDate(pact.offerExpiry)}.
                    </div>
                  )}
                </div>
              )}

              {/* STATUS 0: OFFERED (Expired) */}
              {pact.status === 0 && now > pact.offerExpiry && (
                <div className="space-y-3 p-4 border border-rose-500/40 bg-rose-950/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-rose-400 text-[18px]">timer_off</span>
                    <span className="font-headline-mono text-[13px] font-bold uppercase text-rose-300">
                      Offer Acceptance Window Expired
                    </span>
                  </div>
                  <p className="text-[12px] font-body-sans text-text-muted">
                    The offer cutoff ({formatDate(pact.offerExpiry)}) has passed without counterparty acceptance. Locked maker collateral can be refunded to pull-payment credits.
                  </p>
                  {isMaker ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const action = availableActions.find(a => a.type === 'EXPIRE_OFFER')
                        if (action) {
                          requestActionConfirmation(action, () => execute('expireOffer', [BigInt(id)], 'Expire offer & claim refund'))
                        } else {
                          void execute('expireOffer', [BigInt(id)], 'Expire offer & claim refund')
                        }
                      }}
                      className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                    >
                      Expire Offer & Claim Collateral Refund ({formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)})
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const action = availableActions.find(a => a.type === 'EXPIRE_OFFER')
                        if (action) {
                          requestActionConfirmation(action, () => execute('expireOffer', [BigInt(id)], 'Expire offer'))
                        } else {
                          void execute('expireOffer', [BigInt(id)], 'Expire offer')
                        }
                      }}
                      className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase"
                    >
                      Expire Offer (Public Execution)
                    </button>
                  )}
                </div>
              )}

              {/* STATUS 1: ACTIVE */}
              {pact.status === 1 && (
                <div className="space-y-4">
                  {/* Taker Submit Proof */}
                  {isTaker && now <= pact.performanceDeadline && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-body-sans text-text-muted">
                        Submit delivery tracking reference, IPFS CID, or completion hash before the performance window closes ({formatDate(pact.performanceDeadline)}).
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={proofInput}
                          onChange={e => setProofInput(e.target.value)}
                          placeholder="Proof reference / tracking ID / deliverable link…"
                          className="flex-1 border border-outline-border bg-[#07080a] px-3.5 py-2.5 text-[12px] font-code-hash text-white outline-none focus:border-primary-fixed"
                        />
                        <button
                          type="button"
                          disabled={busy || !proofInput.trim()}
                          onClick={() => {
                            const action = availableActions.find(a => a.type === 'SUBMIT_PROOF')
                            if (action) {
                              requestActionConfirmation(action, () => execute('submitProof', [BigInt(id), hashTerms(proofInput.trim())], 'Submit Proof'))
                            } else {
                              void execute('submitProof', [BigInt(id), hashTerms(proofInput.trim())], 'Submit Proof')
                            }
                          }}
                          className="pact-button-primary min-h-[44px] px-5 text-[11px] font-bold uppercase tracking-wider shrink-0 disabled:opacity-40"
                        >
                          Submit Proof as Counterparty
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Maker Release Collateral */}
                  {isMaker && now <= pact.disputeDeadline && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-body-sans text-text-muted">
                        {now > pact.performanceDeadline
                          ? 'Counterparty did not submit delivery proof. You can release collateral or open a dispute before cutoff.'
                          : 'Once satisfied with deliverable completion, release locked escrow funds directly to the counterparty.'}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'RELEASE_COLLATERAL')
                          if (action) {
                            requestActionConfirmation(action, () => execute('release', [BigInt(id)], 'Release collateral to counterparty'))
                          } else {
                            void execute('release', [BigInt(id)], 'Release collateral to counterparty')
                          }
                        }}
                        className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                      >
                        Release Collateral to Counterparty ({truncateAddress(pact.taker)})
                      </button>
                    </div>
                  )}

                  {/* Open Dispute Trigger */}
                  {canOpenDispute && (
                    <div className="pt-2 border-t border-outline-hairline">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'OPEN_DISPUTE')
                          if (action) {
                            requestActionConfirmation(action, () => openOrRespondDispute('openDispute'))
                          } else {
                            void openOrRespondDispute('openDispute')
                          }
                        }}
                        className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase tracking-wider text-amber-400 hover:border-amber-400"
                      >
                        Open Bonded Dispute as {isMaker ? 'Maker' : 'Counterparty'} ({formatAmount(pact.bondAmount)} USDC Bond)
                      </button>
                    </div>
                  )}

                  {/* Deadline Elapsed (No proof) */}
                  {now > pact.disputeDeadline && (
                    <div className="space-y-3 p-4 border border-rose-500/40 bg-rose-950/20">
                      <p className="text-[12px] font-body-sans text-text-muted">
                        The dispute window elapsed without proof submission or dispute. 100% of locked collateral reverts to the Maker.
                      </p>
                      {isMaker ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const action = availableActions.find(a => a.type === 'DEADLINE_REFUND_MAKER')
                            if (action) {
                              requestActionConfirmation(action, () => execute('refundAfterDeadline', [BigInt(id)], 'Claim full collateral refund'))
                            } else {
                              void execute('refundAfterDeadline', [BigInt(id)], 'Claim full collateral refund')
                            }
                          }}
                          className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                        >
                          Claim Full Collateral Refund as Maker ({formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)})
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const action = availableActions.find(a => a.type === 'DEADLINE_REFUND_MAKER')
                            if (action) {
                              requestActionConfirmation(action, () => execute('refundAfterDeadline', [BigInt(id)], 'Settle after deadline'))
                            } else {
                              void execute('refundAfterDeadline', [BigInt(id)], 'Settle after deadline')
                            }
                          }}
                          className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase"
                        >
                          Settle Pact (Public Execution)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STATUS 2: PROOF SUBMITTED */}
              {pact.status === 2 && (
                <div className="space-y-4">
                  {isMaker && now <= pact.disputeDeadline && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-body-sans text-text-muted">
                        Proof submitted by Counterparty ({truncateAddress(pact.taker)}). Review deliverable proof and release escrow funds, or open a bonded dispute before cutoff ({formatDate(pact.disputeDeadline)}).
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'RELEASE_COLLATERAL')
                          if (action) {
                            requestActionConfirmation(action, () => execute('release', [BigInt(id)], 'Release collateral to counterparty'))
                          } else {
                            void execute('release', [BigInt(id)], 'Release collateral to counterparty')
                          }
                        }}
                        className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                      >
                        Review Proof & Release Escrow to Counterparty
                      </button>
                    </div>
                  )}

                  {isTaker && now <= pact.disputeDeadline && (
                    <div className="p-3.5 border border-outline-hairline bg-[#07080a] text-[12px] text-text-dim font-code-hash">
                      Proof anchored on-chain. Maker ({truncateAddress(pact.maker)}) has until {formatDate(pact.disputeDeadline)} to release funds or open a dispute.
                    </div>
                  )}

                  {canOpenDispute && (
                    <div className="pt-2 border-t border-outline-hairline">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'OPEN_DISPUTE')
                          if (action) {
                            requestActionConfirmation(action, () => openOrRespondDispute('openDispute'))
                          } else {
                            void openOrRespondDispute('openDispute')
                          }
                        }}
                        className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase tracking-wider text-amber-400 hover:border-amber-400"
                      >
                        Open Bonded Dispute as {isMaker ? 'Maker' : 'Counterparty'} ({formatAmount(pact.bondAmount)} USDC Bond)
                      </button>
                    </div>
                  )}

                  {now > pact.disputeDeadline && (
                    <div className="space-y-3 p-4 border border-emerald-500/40 bg-emerald-950/20">
                      <p className="text-[12px] font-body-sans text-text-muted">
                        Dispute window closed with proof unchallenged. Escrow funds and collateral are released 100% to Counterparty ({truncateAddress(pact.taker)}).
                      </p>
                      {isTaker ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const action = availableActions.find(a => a.type === 'DEADLINE_SETTLE_TAKER')
                            if (action) {
                              requestActionConfirmation(action, () => execute('refundAfterDeadline', [BigInt(id)], 'Claim payout & collateral'))
                            } else {
                              void execute('refundAfterDeadline', [BigInt(id)], 'Claim payout & collateral')
                            }
                          }}
                          className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                        >
                          Claim Escrow Payout & Collateral as Counterparty
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const action = availableActions.find(a => a.type === 'DEADLINE_SETTLE_TAKER')
                            if (action) {
                              requestActionConfirmation(action, () => execute('refundAfterDeadline', [BigInt(id)], 'Settle after deadline'))
                            } else {
                              void execute('refundAfterDeadline', [BigInt(id)], 'Settle after deadline')
                            }
                          }}
                          className="pact-button-secondary w-full min-h-[44px] text-[11px] font-bold uppercase"
                        >
                          Settle Pact to Counterparty (Public Execution)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STATUS 3: DISPUTED */}
              {pact.status === 3 && (
                <div className="space-y-4">
                  {canRespond && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-body-sans text-amber-300">
                        A dispute was opened against this pact. Post your matching bond ({formatAmount(pact.bondAmount)} USDC) before {dispute ? formatDate(dispute.responseDeadline) : ''} to contest.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'RESPOND_DISPUTE')
                          if (action) {
                            requestActionConfirmation(action, () => openOrRespondDispute('respondDispute'))
                          } else {
                            void openOrRespondDispute('respondDispute')
                          }
                        }}
                        className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                      >
                        Post Counter-Bond as Respondent & Contest Dispute
                      </button>
                    </div>
                  )}

                  {canRule && (
                    <div className="space-y-3 p-4 border border-outline-hairline bg-[#07080a]">
                      <p className="text-[12px] font-headline-mono font-bold uppercase text-white">
                        Designated Arbiter Decision Panel
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
                          onClick={() => {
                            const action = availableActions.find(a => a.type === 'RULE_DISPUTE_MAKER')
                            if (action) {
                              requestActionConfirmation(action, () => execute('ruleDispute', [BigInt(id), 1, parseUnitsSafe(feeInput)], 'Rule for Maker'))
                            } else {
                              void execute('ruleDispute', [BigInt(id), 1, parseUnitsSafe(feeInput)], 'Rule for Maker')
                            }
                          }}
                          className="pact-button-primary min-h-[44px] text-[11px] font-bold uppercase"
                        >
                          Rule for Maker (100% Refund)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const action = availableActions.find(a => a.type === 'RULE_DISPUTE_TAKER')
                            if (action) {
                              requestActionConfirmation(action, () => execute('ruleDispute', [BigInt(id), 2, parseUnitsSafe(feeInput)], 'Rule for Taker'))
                            } else {
                              void execute('ruleDispute', [BigInt(id), 2, parseUnitsSafe(feeInput)], 'Rule for Taker')
                            }
                          }}
                          className="pact-button-primary min-h-[44px] text-[11px] font-bold uppercase"
                        >
                          Rule for Counterparty (100% Release)
                        </button>
                      </div>
                    </div>
                  )}

                  {canDefault && (
                    <div className="space-y-2 p-4 border border-amber-500/40 bg-amber-950/20">
                      <p className="text-[12px] font-body-sans text-amber-300">
                        Respondent missed the 3-day counter-bond response cutoff. Dispute opener wins 100% bond refund and all collateral.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'DEFAULT_JUDGMENT')
                          if (action) {
                            requestActionConfirmation(action, () => execute('resolveUnansweredDispute', [BigInt(id)], 'Execute default judgment'))
                          } else {
                            void execute('resolveUnansweredDispute', [BigInt(id)], 'Execute default judgment')
                          }
                        }}
                        className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                      >
                        Execute Default Judgment (Unanswered Dispute)
                      </button>
                    </div>
                  )}

                  {canArbiterTimeout && (
                    <div className="space-y-2 p-4 border border-amber-500/40 bg-amber-950/20">
                      <p className="text-[12px] font-body-sans text-amber-300">
                        Designated arbiter did not issue a ruling within 14 days. Both dispute bonds are refunded 100% and collateral is split 50/50.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const action = availableActions.find(a => a.type === 'ARBITER_TIMEOUT')
                          if (action) {
                            requestActionConfirmation(action, () => execute('arbiterTimeout', [BigInt(id)], 'Execute arbiter timeout'))
                          } else {
                            void execute('arbiterTimeout', [BigInt(id)], 'Execute arbiter timeout')
                          }
                        }}
                        className="pact-button-primary w-full min-h-[48px] text-[12px] font-bold uppercase tracking-wider"
                      >
                        Refund Bonds & Split Collateral 50/50 (Arbiter Timeout)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 8. TERMS VERIFICATION & CRYPTOGRAPHIC AUDIT */}
      {/* ========================================================================= */}
      <TermsVerifier
        canonicalTerms={pactTerms}
        onChainTermsHash={pact.termsHash as `0x${string}`}
        plaintextTerms={termsInput}
        onPlaintextChange={setTermsInput}
        isTaker={isTaker}
      />

      {/* ========================================================================= */}
      {/* 9. PROOF PAYLOAD & DISPUTE AUDIT TRAIL */}
      {/* ========================================================================= */}
      <section aria-label="Delivery Proof and Audit" className="border border-outline-border bg-[#0c0f12] p-5 animate-enter space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-outline-hairline">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary-fixed">inventory_2</span>
            <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
              Fulfillment Proof & Audit
            </h2>
          </div>
          <span className="text-[10px] font-code-hash text-text-dim">On-Chain Delivery</span>
        </div>

        {pact.status >= 2 && pact.proofHash && pact.proofHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' ? (
          <div className="space-y-2">
            <span className="text-[10px] font-label-caps uppercase text-emerald-400 block font-bold">
              ✓ Proof Anchored On-Chain
            </span>
            <div className="p-3 border border-emerald-500/30 bg-[#07080a] font-code-hash text-[11px] text-emerald-300 break-all select-all">
              {pact.proofHash}
            </div>
          </div>
        ) : (
          <div className="p-4 border border-outline-hairline bg-[#07080a] text-center font-code-hash text-[12px] text-text-dim">
            No delivery proof submitted yet.
          </div>
        )}

        {/* Active Dispute Information Summary */}
        {dispute && (
          <div className="p-3 border border-amber-500/30 bg-amber-950/15 text-[11px] font-code-hash space-y-1.5">
            <div className="flex justify-between">
              <span className="text-text-muted">Dispute Opener:</span>
              <span className="text-white font-bold">{truncateAddress(dispute.opener)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Claim Type:</span>
              <span className="text-amber-400 font-bold">{dispute.claim === 1 ? 'Maker Claim (Refund)' : 'Taker Claim (Release)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Response Cutoff:</span>
              <span className="text-white">{formatDate(dispute.responseDeadline)}</span>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 10. PROGRESSIVE DISCLOSURE: ON-CHAIN TECHNICAL DETAILS */}
      {/* ========================================================================= */}
      <AdvancedDetails
        contractAddress={protocolAddress}
        tokenMaker={pact.tokenMaker}
        tokenTaker={pact.amountTaker > 0n ? pact.tokenTaker : undefined}
        termsHash={pact.termsHash}
        proofHash={pact.proofHash}
        pactId={pact.id}
        rawTimestamps={{
          createdAt: pact.createdAt,
          updatedAt: pact.updatedAt,
          offerExpiry: pact.offerExpiry,
          performanceDeadline: pact.performanceDeadline,
          disputeDeadline: pact.disputeDeadline,
        }}
        defaultOpen={false}
      />

      {/* ========================================================================= */}
      {/* 11. MOBILE STICKY BOTTOM ACTION BAR (< md) */}
      {/* ========================================================================= */}
      {primaryAction && primaryAction.isEligible && !isTerminal(pact.status) && (
        <div className="mobile-sticky-action md:hidden fixed left-0 right-0 z-40 p-3 bg-[#0c0f12]/95 backdrop-blur-md border-t border-primary-fixed/40 flex items-center justify-between gap-3 animate-enter">
          <div className="truncate">
            <span className="font-headline-mono text-[11px] font-bold text-white block truncate">
              Pact #{String(id).padStart(4, '0')} · {statusLabel(pact.status)}
            </span>
            <span className="text-[10px] text-primary-fixed block truncate">
              {primaryAction.label}
            </span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const anchor = document.querySelector('section[aria-label="Action Execution Panel"]')
              if (anchor) {
                anchor.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            }}
            className="pact-button-primary min-h-[44px] px-4 text-[11px] font-bold uppercase tracking-wider shrink-0"
          >
            Act Now →
          </button>
        </div>
      )}

      {/* Pre-Flight Confirmation Modal */}
      <ActionConfirmModal
        isOpen={Boolean(confirmAction)}
        pactId={id}
        action={confirmAction}
        isSubmitting={isSubmittingConfirm}
        onConfirm={handleConfirmModalSubmit}
        onCancel={() => {
          setConfirmAction(null)
          setConfirmCallback(null)
        }}
      />

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
