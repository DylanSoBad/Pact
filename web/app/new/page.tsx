'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { decodeEventLog, formatUnits, isAddress, parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from 'wagmi'
import { useModal } from 'connectkit'
import { toast } from 'sonner'
import { ERC20_ABI, PACT_ABI } from '../../lib/abi'
import { CIRCLE_FAUCET_URL, EURC, USDC_ERC20, WETH, WBTC, arcTestnet, getPactAddress } from '../../lib/arc'
import { hashPactTerms, hashTerms } from '../../lib/terms'
import { signPermit, type PermitAuthorization } from '../../lib/permit'
import { fetchReputation } from '../../lib/reads'
import {
  NEW_PACT_FIELD_ORDER,
  PARTIES_FIELDS,
  COLLATERAL_FIELDS,
  TERMS_DEADLINES_FIELDS,
  ZERO_ADDRESS,
  validateNewPactForm,
  getStepFields,
  getFirstInvalidFieldForStep,
  isStepValid,
  type NewPactField,
  type FormStep,
} from '../../lib/newPactValidation'
import TokenSelect from '../../components/TokenSelect'
import TransactionProgress, { type TransactionStage } from '../../components/TransactionProgress'
import { transactionErrorMessage } from '../../lib/transactionErrors'
import RoleBadge from '../../components/RoleBadge'
import AddressDisplay from '../../components/AddressDisplay'
import { formatDate } from '../../lib/format'

const KINDS = [
  {
    value: 0,
    label: 'Delivery Escrow',
    tag: 'DELIVERY',
    desc: 'Buyer locks purchase funds in escrow; seller delivers physical goods or off-chain asset; payment is released upon proof & verification.',
  },
  {
    value: 1,
    label: 'Job & Milestone Bounty',
    tag: 'JOB',
    desc: 'Client locks bounty for verifiable work or digital deliverables; contractor submits work hash before deadline.',
  },
] as const

const TOKENS = [
  { value: USDC_ERC20, label: 'USDC' },
  { value: EURC, label: 'EURC' },
  { value: WETH, label: 'WETH' },
  { value: WBTC, label: 'WBTC' },
]

type TransactionPhase = 'idle' | 'approving' | 'creating' | 'done'

function parseTokenAmount(value: string, decimals = 6): bigint {
  try {
    return parseUnits(value || '0', decimals)
  } catch {
    return 0n
  }
}

export default function NewPactPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { switchChain } = useSwitchChain()
  const { setOpen: openWalletModal } = useModal()

  const protocolAddress = getPactAddress(chainId)
  const [currentStep, setCurrentStep] = useState<FormStep>(1)
  const [kind, setKind] = useState<number>(0)
  const [tokenMaker, setTokenMaker] = useState<`0x${string}`>(USDC_ERC20)
  const [tokenTaker, setTokenTaker] = useState<`0x${string}`>(EURC)
  const [amountMaker, setAmountMaker] = useState('')
  const [amountTaker, setAmountTaker] = useState('')
  const [notionalUSDC, setNotionalUSDC] = useState('')
  const [arbiterFeeCap, setArbiterFeeCap] = useState('1')
  const [taker, setTaker] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [terms, setTerms] = useState('')
  const [offerHours, setOfferHours] = useState('24')
  const [performanceDays, setPerformanceDays] = useState('7')
  const [disputeDays, setDisputeDays] = useState('3')
  const [blurSize, setBlurSize] = useState(false)
  const [phase, setPhase] = useState<TransactionPhase>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStage, setTxStage] = useState<TransactionStage>('idle')
  const [txLabel, setTxLabel] = useState('')
  const [txError, setTxError] = useState('')
  const [createdPactId, setCreatedPactId] = useState<number | null>(null)
  const [reputation, setReputation] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)
  const [touchedFields, setTouchedFields] = useState<Partial<Record<NewPactField, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const fieldRefs = useRef<Partial<Record<NewPactField, HTMLInputElement | HTMLTextAreaElement | null>>>({})

  useEffect(() => {
    document.title = 'PACT · Create New Pact'
  }, [])

  // Auto-fetch counterparty on-chain reputation when valid address is entered
  useEffect(() => {
    if (!isAddress(taker) || taker.toLowerCase() === ZERO_ADDRESS) {
      setReputation(null)
      return
    }
    let cancelled = false
    fetchReputation(taker).then(value => {
      if (!cancelled) setReputation(value)
    })
    return () => { cancelled = true }
  }, [taker])

  const { data: makerDecimalsData } = useReadContract({
    address: tokenMaker,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  const makerDecimals = Number(makerDecimalsData ?? 6)
  const makerAmount = parseTokenAmount(amountMaker, makerDecimals)
  const takerAmount = parseTokenAmount(amountTaker)
  const notionalAmount = parseTokenAmount(notionalUSDC)
  const feeCapAmount = parseTokenAmount(arbiterFeeCap)

  const { data: makerBalanceData } = useReadContract({
    address: tokenMaker,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })
  const makerBalance = makerBalanceData ?? 0n

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: tokenMaker,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && protocolAddress ? [address, protocolAddress] : undefined,
    query: { enabled: Boolean(address && protocolAddress) },
  })
  const allowance = allowanceData ?? 0n

  const timestamps = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    const safeWindow = (value: string) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }
    const offerExpiry = now + safeWindow(offerHours) * 60 * 60
    const performanceDeadline = offerExpiry + safeWindow(performanceDays) * 24 * 60 * 60
    const disputeDeadline = performanceDeadline + safeWindow(disputeDays) * 24 * 60 * 60
    return {
      offerExpiry: BigInt(Math.floor(offerExpiry)),
      performanceDeadline: BigInt(Math.floor(performanceDeadline)),
      disputeDeadline: BigInt(Math.floor(disputeDeadline)),
    }
  }, [offerHours, performanceDays, disputeDays])

  // 5% Dispute bond calculation (1 USDC minimum)
  const calculatedBond = notionalAmount > 0n
    ? ((notionalAmount * 500n + 9_999n) / 10_000n < 1_000_000n ? 1_000_000n : (notionalAmount * 500n + 9_999n) / 10_000n)
    : 0n

  // Auto-sync notional value if user inputs maker amount in USDC
  useEffect(() => {
    if (tokenMaker.toLowerCase() === USDC_ERC20.toLowerCase() && amountMaker && !notionalUSDC) {
      setNotionalUSDC(amountMaker)
    }
  }, [amountMaker, tokenMaker, notionalUSDC])

  const fieldErrors = useMemo(() => validateNewPactForm({
    makerAddress: address,
    isConnected,
    makerBalanceKnown: makerBalanceData !== undefined,
    taker,
    arbiter,
    amountMaker,
    amountTaker,
    notionalUSDC,
    arbiterFeeCap,
    offerHours,
    performanceDays,
    disputeDays,
    terms,
    makerAmount,
    makerBalance,
    notionalAmount,
    feeCapAmount,
    calculatedBond,
  }), [address, amountMaker, amountTaker, arbiter, arbiterFeeCap, calculatedBond, disputeDays, feeCapAmount, isConnected, makerAmount, makerBalance, makerBalanceData, notionalAmount, notionalUSDC, offerHours, performanceDays, taker, terms])

  const validationError = NEW_PACT_FIELD_ORDER.map(field => fieldErrors[field]).find(Boolean) ?? ''

  function touchField(field: NewPactField) {
    setTouchedFields(current => ({ ...current, [field]: true }))
  }

  function touchStepFields(step: FormStep) {
    const fields = getStepFields(step)
    setTouchedFields(current => {
      const updated = { ...current }
      fields.forEach(f => { updated[f] = true })
      return updated
    })
  }

  function visibleFieldError(field: NewPactField) {
    return submitAttempted || touchedFields[field] ? fieldErrors[field] : undefined
  }

  function focusFirstInvalidFieldInStep(step: FormStep) {
    const firstInvalid = getFirstInvalidFieldForStep(step, fieldErrors)
    if (!firstInvalid) return
    requestAnimationFrame(() => {
      const el = fieldRefs.current[firstInvalid]
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }

  function goToStep(targetStep: FormStep) {
    // If going forward, validate current step
    if (targetStep > currentStep) {
      touchStepFields(currentStep)
      const valid = isStepValid(currentStep, fieldErrors)
      if (!valid) {
        toast.error('Please resolve the highlighted errors before proceeding.')
        focusFirstInvalidFieldInStep(currentStep)
        return
      }
    }
    setCurrentStep(targetStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const createArgs = useMemo(() => [
    kind,
    taker as `0x${string}`,
    arbiter as `0x${string}`,
    tokenMaker,
    takerAmount > 0n ? tokenTaker : (ZERO_ADDRESS as `0x${string}`),
    makerAmount,
    takerAmount,
    notionalAmount,
    feeCapAmount,
    timestamps.offerExpiry,
    timestamps.performanceDeadline,
    timestamps.disputeDeadline,
    hashTerms(terms),
    blurSize,
  ] as const, [arbiter, blurSize, feeCapAmount, kind, makerAmount, notionalAmount, taker, takerAmount, terms, timestamps, tokenMaker, tokenTaker])

  const canonicalTermsHash = useMemo(() => {
    if (!protocolAddress || !address || !isAddress(taker) || !isAddress(arbiter) || !terms) return null
    return hashPactTerms({
      pactAddress: protocolAddress,
      chainId: BigInt(arcTestnet.id),
      maker: address,
      taker,
      arbiter,
      tokenMaker,
      tokenTaker: takerAmount > 0n ? tokenTaker : ZERO_ADDRESS,
      amountMaker: makerAmount,
      amountTaker: takerAmount,
      notionalUSDC: notionalAmount,
      arbiterFeeCap: feeCapAmount,
      ...timestamps,
      kind,
      blurSize,
    }, terms)
  }, [address, arbiter, blurSize, feeCapAmount, kind, makerAmount, notionalAmount, protocolAddress, taker, takerAmount, terms, timestamps, tokenMaker, tokenTaker])

  async function submitPact() {
    if (!isConnected) {
      openWalletModal(true)
      return
    }
    if (chainId !== arcTestnet.id) {
      switchChain({ chainId: arcTestnet.id })
      return
    }
    setSubmitAttempted(true)
    
    // Check all fields
    if (validationError) {
      // Find first step with error and switch to it
      for (const step of [1, 2, 3] as FormStep[]) {
        if (!isStepValid(step, fieldErrors)) {
          setCurrentStep(step)
          touchStepFields(step)
          toast.error(validationError)
          focusFirstInvalidFieldInStep(step)
          return
        }
      }
      toast.error(validationError)
      return
    }

    if (!address || !protocolAddress || !publicClient || !walletClient) {
      toast.error('Wallet client is not ready')
      return
    }

    try {
      let permit: PermitAuthorization | null = null
      if (allowance !== makerAmount) {
        setPhase('approving')
        setTxStage('awaiting-signature')
        setTxLabel(`Authorize exact collateral (${amountMaker} ${TOKENS.find(t => t.value === tokenMaker)?.label}). No unlimited allowance requested.`)
        
        const approve = async (value: bigint) => {
          const approval = await publicClient.simulateContract({
            account: address,
            address: tokenMaker,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [protocolAddress, value],
          })
          const approvalHash = await walletClient.writeContract(approval.request)
          setTxHash(approvalHash)
          setTxStage('confirming')
          setTxLabel('Exact collateral approval is being confirmed on Arc Testnet.')
          await publicClient.waitForTransactionReceipt({ hash: approvalHash })
        }

        if (tokenMaker.toLowerCase() === USDC_ERC20.toLowerCase()) {
          try {
            permit = await signPermit({
              publicClient,
              walletClient,
              chainId: arcTestnet.id,
              token: USDC_ERC20,
              owner: address,
              spender: protocolAddress,
              value: makerAmount,
            })
          } catch {
            toast.info('Permit signature unavailable; falling back to exact ERC-20 approval')
          }
        }
        if (!permit) {
          if (allowance !== 0n) await approve(0n)
          await approve(makerAmount)
          await refetchAllowance()
        }
      }

      setPhase('creating')
      setTxStage('awaiting-signature')
      setTxLabel('Confirm pact creation & escrow lock in your wallet.')

      const simulation = await publicClient.simulateContract({
        account: address,
        address: protocolAddress,
        abi: PACT_ABI,
        functionName: permit ? 'createPactWithPermit' : 'createPact',
        args: permit ? [...createArgs, permit.deadline, permit.v, permit.r, permit.s] : createArgs,
      } as never)

      const creationHash = await walletClient.writeContract(simulation.request)
      setTxHash(creationHash)
      setTxStage('confirming')
      setTxLabel('Maker collateral is being locked in escrow and agreement is anchored on-chain.')
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: creationHash })
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: PACT_ABI, data: log.data, topics: log.topics })
          if (decoded.eventName === 'PactCreated') {
            setCreatedPactId(Number(decoded.args.id))
          }
        } catch { /* unrelated log */ }
      }

      setPhase('done')
      setTxStage('success')
      setTxLabel('The pact offer is live on-chain and maker collateral is secured in escrow.')
      toast.success('Pact created successfully')
    } catch (error) {
      const message = transactionErrorMessage(error)
      setPhase('idle')
      setTxStage('error')
      setTxError(message)
      toast.error(message)
    }
  }

  // Success Confirmation Screen
  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-[640px] py-8">
        <div className="border border-primary-fixed/40 bg-[#0c0f12] p-6 sm:p-10 text-center animate-enter shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center bg-primary-fixed text-black font-display-mono text-2xl font-bold rounded-[2px]">
            ✓
          </div>
          <p className="pact-eyebrow mb-1">Escrow Activated & Anchored</p>
          <h1 className="font-display-mono text-[24px] sm:text-[28px] font-bold text-white tracking-tight">
            Pact Offer Committed
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-text-muted font-body-sans max-w-md mx-auto">
            Maker collateral has been locked in the verified PACT protocol vault. Your designated counterparty can now review terms and accept on-chain.
          </p>

          <div className="mt-6 p-4 border border-outline-border bg-[#07080a] text-left font-code-hash text-[12px] space-y-2.5">
            <div className="flex justify-between items-center pb-2 border-b border-outline-hairline">
              <span className="text-text-muted">Agreement ID:</span>
              <span className="text-white font-bold text-[14px]">#{createdPactId ? String(createdPactId).padStart(4, '0') : '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Locked Escrow Collateral:</span>
              <span className="text-primary-fixed font-bold">{amountMaker} {TOKENS.find(t => t.value === tokenMaker)?.label}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Offer Expiry Window:</span>
              <span className="text-white">{offerHours} hours</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-outline-hairline/60">
              <span className="text-text-muted">Canonical Terms Hash:</span>
              <span className="text-primary-fixed text-[10px] break-all font-mono">{canonicalTermsHash || '—'}</span>
            </div>
          </div>

          <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
            {createdPactId && (
              <Link
                href={`/p/${createdPactId}`}
                className="pact-button-primary min-h-[44px] px-6 text-[12px] font-bold uppercase tracking-wider"
              >
                Open Pact #{String(createdPactId).padStart(4, '0')} →
              </Link>
            )}
            {txHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="pact-button-secondary min-h-[44px] px-5 text-[12px] uppercase tracking-wider"
              >
                View on ArcScan ↗
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  const fieldClassFor = (field: NewPactField) => `
    w-full border bg-[#07080a] px-3.5 py-2.5 text-[13px] font-code-hash text-white outline-none transition-all
    ${visibleFieldError(field)
      ? 'border-status-error focus:border-status-error ring-1 ring-status-error/40 bg-rose-950/10'
      : 'border-outline-border hover:border-outline-variant focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed/20'}
  `
  const errorId = (field: NewPactField) => `${field}-error`
  const renderFieldError = (field: NewPactField) => {
    const error = visibleFieldError(field)
    return error ? (
      <div id={errorId(field)} className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-status-error font-code-hash animate-enter" role="alert">
        <span className="font-bold shrink-0 mt-0.5 text-[12px]">⚠️</span>
        <span>{error}</span>
      </div>
    ) : null
  }

  const busy = phase !== 'idle'

  const step1Valid = isStepValid(1, fieldErrors)
  const step2Valid = isStepValid(2, fieldErrors)
  const step3Valid = isStepValid(3, fieldErrors)

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-6">
      {/* Testnet / Network Notice Banner */}
      <div className="border border-primary-fixed/30 bg-primary-fixed/[0.04] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-enter">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-primary-fixed text-[20px]" aria-hidden="true">verified_user</span>
          <div>
            <p className="text-[12px] font-headline-mono font-bold uppercase tracking-wider text-primary-fixed">
              Arc Testnet · Exact ERC-20 Escrow
            </p>
            <p className="text-[11px] font-body-sans text-text-muted mt-0.5">
              Pull-based settlement with bounded arbitration. No native transfers or unlimited allowances.
            </p>
          </div>
        </div>
        <a
          href={CIRCLE_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pact-button-secondary min-h-[38px] px-3 font-label-caps text-[10px] font-bold uppercase tracking-wider shrink-0"
        >
          Circle Faucet ↗
        </a>
      </div>

      {!protocolAddress && (
        <div role="alert" className="border border-status-warning/60 bg-status-warning/10 p-4 text-[12px] text-amber-300 font-code-hash">
          <strong>Protocol contract not configured:</strong> Please check network connection or deployment settings.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-outline-hairline pb-5 animate-enter">
        <p className="pact-eyebrow mb-1">Create Committed Offer</p>
        <h1 className="font-display-mono text-[26px] sm:text-[32px] font-bold text-white tracking-tight">
          New Pact
        </h1>
        <p className="mt-1 font-body-sans text-[13px] text-text-muted max-w-xl">
          Create an on-chain escrow commitment. Configure parties, collateral, deadlines, and plaintext terms through the 4-step wizard.
        </p>
      </header>

      {/* Step Navigation Wizard Stepper */}
      <nav aria-label="Form Steps" className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-code-hash text-[11px]">
        {[
          { num: 1 as FormStep, label: '1. Parties', valid: step1Valid, fields: PARTIES_FIELDS },
          { num: 2 as FormStep, label: '2. Collateral', valid: step2Valid, fields: COLLATERAL_FIELDS },
          { num: 3 as FormStep, label: '3. Terms & Deadlines', valid: step3Valid, fields: TERMS_DEADLINES_FIELDS },
          { num: 4 as FormStep, label: '4. Review & Sign', valid: step1Valid && step2Valid && step3Valid, fields: [] },
        ].map(step => {
          const isActive = currentStep === step.num
          const isPassed = currentStep > step.num
          const hasError = submitAttempted && !step.valid

          return (
            <button
              key={step.num}
              type="button"
              onClick={() => goToStep(step.num)}
              className={`p-3 border text-left transition-all flex items-center justify-between gap-2 ${
                isActive
                  ? 'border-primary-fixed bg-primary-fixed/10 text-primary-fixed font-bold'
                  : isPassed
                  ? 'border-outline-border bg-[#0c0f12] text-white hover:border-outline-variant'
                  : 'border-outline-hairline/60 bg-[#07080a] text-text-dim hover:text-text-muted hover:border-outline-border'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  isActive
                    ? 'bg-primary-fixed text-black'
                    : isPassed
                    ? 'bg-emerald-500 text-black'
                    : 'bg-[#1a2027] text-text-dim'
                }`}>
                  {isPassed ? '✓' : step.num}
                </span>
                <span className="truncate">{step.label}</span>
              </div>
              {hasError && (
                <span className="text-status-error font-bold shrink-0 text-[10px]" title="Contains validation errors">
                  !
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Main Form Body */}
      <form onSubmit={e => { e.preventDefault(); submitPact() }} noValidate className="space-y-6">
        
        {/* ========================================================================= */}
        {/* STEP 1: PARTIES & STRUCTURE */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <section aria-labelledby="step-1-title" className="border border-outline-border bg-[#0c0f12] p-5 sm:p-6 animate-enter space-y-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-hairline">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center bg-primary-fixed text-black font-display-mono text-[11px] font-bold">1</span>
                <h2 id="step-1-title" className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">
                  Parties & Agreement Structure
                </h2>
              </div>
              <span className="text-[10px] font-label-caps uppercase text-text-dim">Deal Type & Addresses</span>
            </div>

            {/* Maker Role Card */}
            <div className="p-4 border border-outline-hairline bg-[#07080a] flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-code-hash text-[12px]">
              <div className="flex items-center gap-2 flex-wrap">
                <RoleBadge role="MAKER" isCurrentUser={true} size="sm" />
                <span className="text-text-muted">You are creating this pact as Maker (Escrow Depositor).</span>
              </div>
              <div className="shrink-0">
                {address ? (
                  <AddressDisplay address={address} showCopy={true} showExplorer={true} />
                ) : (
                  <span className="text-amber-400 font-bold">Wallet Disconnected</span>
                )}
              </div>
            </div>

            {/* Deal Kind Selection */}
            <div>
              <label className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-2">
                Select Agreement Model
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {KINDS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setKind(option.value)}
                    className={`p-4 text-left border transition-all cursor-pointer ${
                      kind === option.value
                        ? 'border-primary-fixed bg-primary-fixed/[0.08] shadow-[0_0_15px_rgba(243,232,140,0.06)]'
                        : 'border-outline-border bg-[#07080a] hover:border-outline-variant'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-headline-mono text-[13px] font-bold text-white">
                        {option.label}
                      </span>
                      <span className="px-1.5 py-0.5 border border-outline-border bg-[#12161b] text-[9px] font-label-caps uppercase text-text-muted">
                        {option.tag}
                      </span>
                    </div>
                    <p className="mt-2 font-body-sans text-[11px] leading-5 text-text-muted">
                      {option.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Counterparty & Arbiter Address Inputs */}
            <div className="grid gap-5 sm:grid-cols-2 pt-2 border-t border-outline-hairline/60">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-taker" className="font-label-caps text-[11px] uppercase tracking-wider text-text-muted">
                    Designated Counterparty Wallet <span className="text-status-error">*</span>
                  </label>
                  <RoleBadge role="TAKER" isCurrentUser={false} size="xs" />
                </div>
                <input
                  id="input-taker"
                  ref={el => { fieldRefs.current.taker = el }}
                  value={taker}
                  onChange={e => setTaker(e.target.value.trim())}
                  onBlur={() => touchField('taker')}
                  aria-invalid={Boolean(visibleFieldError('taker'))}
                  aria-describedby={visibleFieldError('taker') ? errorId('taker') : undefined}
                  placeholder="0x… (42-character Arc address)"
                  className={fieldClassFor('taker')}
                />
                {renderFieldError('taker')}
                <p className="mt-1 text-[10px] text-text-dim font-body-sans">
                  The only address authorized to accept this agreement and deliver fulfillment proof.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-arbiter" className="font-label-caps text-[11px] uppercase tracking-wider text-text-muted">
                    Designated Arbiter Wallet <span className="text-status-error">*</span>
                  </label>
                  <RoleBadge role="ARBITER" isCurrentUser={false} size="xs" />
                </div>
                <input
                  id="input-arbiter"
                  ref={el => { fieldRefs.current.arbiter = el }}
                  value={arbiter}
                  onChange={e => setArbiter(e.target.value.trim())}
                  onBlur={() => touchField('arbiter')}
                  aria-invalid={Boolean(visibleFieldError('arbiter'))}
                  aria-describedby={visibleFieldError('arbiter') ? errorId('arbiter') : undefined}
                  placeholder="0x… (Neutral third-party mediator)"
                  className={fieldClassFor('arbiter')}
                />
                {renderFieldError('arbiter')}
                <p className="mt-1 text-[10px] text-text-dim font-body-sans">
                  Neutral arbitrator who will adjudicate and split escrow funds if a dispute is formally opened.
                </p>
              </div>
            </div>

            {reputation && (
              <div className="p-3.5 border border-outline-hairline bg-[#07080a] flex items-center justify-between text-[11px] font-code-hash text-text-muted">
                <span>Counterparty On-Chain Track Record:</span>
                <span className="text-white">
                  <strong className="text-emerald-400">{reputation.cleared} settled</strong> · <strong className="text-rose-400">{reputation.slashed} disputes lost</strong>
                </span>
              </div>
            )}

            {/* Step 1 Actions */}
            <div className="pt-4 border-t border-outline-hairline flex justify-end">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="pact-button-primary min-h-[42px] px-6 text-[12px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
              >
                <span>Continue to Collateral & Economics</span>
                <span>→</span>
              </button>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: COLLATERAL & DISPUTE ECONOMICS */}
        {/* ========================================================================= */}
        {currentStep === 2 && (
          <section aria-labelledby="step-2-title" className="border border-outline-border bg-[#0c0f12] p-5 sm:p-6 animate-enter space-y-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-hairline">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center bg-primary-fixed text-black font-display-mono text-[11px] font-bold">2</span>
                <h2 id="step-2-title" className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">
                  Collateral & Dispute Economics
                </h2>
              </div>
              <span className="text-[10px] font-label-caps uppercase text-text-dim">Escrow & Bond Calculations</span>
            </div>

            {/* Maker Collateral Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <TokenSelect
                  label="Maker Collateral Token"
                  value={tokenMaker}
                  onChange={val => setTokenMaker(val as `0x${string}`)}
                  tokens={TOKENS}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-amount-maker" className="font-label-caps text-[11px] uppercase tracking-wider text-text-muted">
                    Maker Collateral to Lock <span className="text-status-error">*</span>
                  </label>
                  {makerBalanceData !== undefined && (
                    <button
                      type="button"
                      onClick={() => setAmountMaker(formatUnits(makerBalance, makerDecimals))}
                      className="text-[10px] font-code-hash text-primary-fixed hover:underline"
                    >
                      MAX: {formatUnits(makerBalance, makerDecimals)}
                    </button>
                  )}
                </div>
                <input
                  id="input-amount-maker"
                  ref={el => { fieldRefs.current.amountMaker = el }}
                  inputMode="decimal"
                  value={amountMaker}
                  onChange={e => setAmountMaker(e.target.value)}
                  onBlur={() => touchField('amountMaker')}
                  aria-invalid={Boolean(visibleFieldError('amountMaker'))}
                  aria-describedby={visibleFieldError('amountMaker') ? errorId('amountMaker') : undefined}
                  placeholder="e.g. 500.00"
                  className={fieldClassFor('amountMaker')}
                />
                {renderFieldError('amountMaker')}
              </div>
            </div>

            {/* Counterparty Collateral & Valuation */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-outline-hairline/60">
              <div>
                <TokenSelect
                  label="Counterparty Token"
                  value={tokenTaker}
                  onChange={val => setTokenTaker(val as `0x${string}`)}
                  tokens={TOKENS}
                />
              </div>
              <div>
                <label htmlFor="input-amount-taker" className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  Counterparty Collateral Required (Optional)
                </label>
                <input
                  id="input-amount-taker"
                  ref={el => { fieldRefs.current.amountTaker = el }}
                  inputMode="decimal"
                  value={amountTaker}
                  onChange={e => setAmountTaker(e.target.value)}
                  onBlur={() => touchField('amountTaker')}
                  aria-invalid={Boolean(visibleFieldError('amountTaker'))}
                  aria-describedby={visibleFieldError('amountTaker') ? errorId('amountTaker') : undefined}
                  placeholder="0.00 (leave empty for single-sided escrow)"
                  className={fieldClassFor('amountTaker')}
                />
                {renderFieldError('amountTaker')}
              </div>

              <div>
                <label htmlFor="input-notional-usdc" className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  Notional Value in USDC <span className="text-status-error">*</span>
                </label>
                <input
                  id="input-notional-usdc"
                  ref={el => { fieldRefs.current.notionalUSDC = el }}
                  inputMode="decimal"
                  value={notionalUSDC}
                  onChange={e => setNotionalUSDC(e.target.value)}
                  onBlur={() => touchField('notionalUSDC')}
                  aria-invalid={Boolean(visibleFieldError('notionalUSDC'))}
                  aria-describedby={visibleFieldError('notionalUSDC') ? errorId('notionalUSDC') : undefined}
                  placeholder="e.g. 500"
                  className={fieldClassFor('notionalUSDC')}
                />
                {renderFieldError('notionalUSDC')}
                <p className="mt-1 text-[10px] text-text-dim font-body-sans">
                  Determines the required 5% dispute bond posted by claimants.
                </p>
              </div>

              <div>
                <label htmlFor="input-arbiter-fee-cap" className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  Arbiter Fee Cap (USDC)
                </label>
                <input
                  id="input-arbiter-fee-cap"
                  ref={el => { fieldRefs.current.arbiterFeeCap = el }}
                  inputMode="decimal"
                  value={arbiterFeeCap}
                  onChange={e => setArbiterFeeCap(e.target.value)}
                  onBlur={() => touchField('arbiterFeeCap')}
                  aria-invalid={Boolean(visibleFieldError('arbiterFeeCap'))}
                  aria-describedby={visibleFieldError('arbiterFeeCap') ? errorId('arbiterFeeCap') : undefined}
                  className={fieldClassFor('arbiterFeeCap')}
                />
                {renderFieldError('arbiterFeeCap')}
                <p className="mt-1 text-[10px] text-text-dim font-body-sans">
                  Maximum compensation deducted for arbiter from the dispute bond upon ruling.
                </p>
              </div>
            </div>

            {/* Calculated Bond & Arbiter Fee Policy Card */}
            <div className="p-4 border border-outline-hairline bg-[#07080a] text-[12px] font-code-hash space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Calculated Dispute Bond:</span>
                <span className="text-primary-fixed font-bold text-[13px]">{formatUnits(calculatedBond, 6)} USDC</span>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-1 border-t border-outline-hairline/40">
                <span className="text-text-dim">Arbiter Fee Cap:</span>
                <span className="text-white font-mono">{arbiterFeeCap || '0'} USDC</span>
              </div>
              <div className="p-2.5 bg-[#0c0f12] border border-outline-hairline/60 rounded-[1px] text-[10px] leading-relaxed text-text-muted font-body-sans space-y-1">
                <div className="text-primary-fixed font-bold uppercase tracking-wider font-headline-mono text-[10px]">
                  🛡️ Bounded Arbiter Fee Policy
                </div>
                <p>
                  • <strong>Loser Pays:</strong> The Arbiter Fee is deducted exclusively from the losing party&apos;s dispute bond if an active dispute is ruled upon.
                </p>
                <p>
                  • <strong>Collateral Ring-Fenced:</strong> Escrowed collateral principal is 100% protected and awarded to the winner without deductions.
                </p>
                <p>
                  • <strong>Zero-Fee Guarantee:</strong> If the contract settles normally, resolves via 3-day default, or the arbiter times out (14 days), the arbiter fee is strictly <strong>0.00 USDC</strong>.
                </p>
              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="pt-4 border-t border-outline-hairline flex items-center justify-between">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="pact-button-secondary min-h-[42px] px-5 text-[11px] uppercase tracking-wider"
              >
                ← Back to Parties
              </button>
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="pact-button-primary min-h-[42px] px-6 text-[12px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
              >
                <span>Continue to Terms & Deadlines</span>
                <span>→</span>
              </button>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: TERMS & DEADLINES */}
        {/* ========================================================================= */}
        {currentStep === 3 && (
          <section aria-labelledby="step-3-title" className="border border-outline-border bg-[#0c0f12] p-5 sm:p-6 animate-enter space-y-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-hairline">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center bg-primary-fixed text-black font-display-mono text-[11px] font-bold">3</span>
                <h2 id="step-3-title" className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">
                  Deadlines & Agreement Terms
                </h2>
              </div>
              <span className="text-[10px] font-label-caps uppercase text-text-dim">Time Windows & Plaintext</span>
            </div>

            {/* Written Terms Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="input-terms" className="font-label-caps text-[11px] uppercase tracking-wider text-text-muted">
                  Agreement Terms & Specifications <span className="text-status-error">*</span>
                </label>
                <span className="text-[10px] font-code-hash text-text-dim">
                  {terms.length} / 2000 characters
                </span>
              </div>
              <textarea
                id="input-terms"
                ref={el => { fieldRefs.current.terms = el }}
                value={terms}
                onChange={e => setTerms(e.target.value)}
                onBlur={() => touchField('terms')}
                aria-invalid={Boolean(visibleFieldError('terms'))}
                aria-describedby={visibleFieldError('terms') ? errorId('terms') : undefined}
                maxLength={2000}
                rows={6}
                placeholder="Detail the deliverables, milestone conditions, quality standards, and fulfillment criteria..."
                className={`${fieldClassFor('terms')} resize-y`}
              />
              {renderFieldError('terms')}
              <div className="mt-1.5 flex items-center justify-between text-[10px] font-code-hash text-text-dim">
                <span>Terms are hashed client-side using SHA-256 for privacy and zero gas overhead.</span>
                {terms.trim() && (
                  <span className="text-primary-fixed font-bold truncate max-w-[220px]">
                    SHA-256: {hashTerms(terms).slice(0, 16)}…
                  </span>
                )}
              </div>
            </div>

            {/* Deadlines Inputs */}
            <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-outline-hairline/60">
              <div>
                <label htmlFor="input-offer-hours" className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  Offer Expiry Window (Hours) <span className="text-status-error">*</span>
                </label>
                <input
                  id="input-offer-hours"
                  ref={el => { fieldRefs.current.offerHours = el }}
                  inputMode="numeric"
                  value={offerHours}
                  onChange={e => setOfferHours(e.target.value)}
                  onBlur={() => touchField('offerHours')}
                  aria-invalid={Boolean(visibleFieldError('offerHours'))}
                  aria-describedby={visibleFieldError('offerHours') ? errorId('offerHours') : undefined}
                  className={fieldClassFor('offerHours')}
                />
                {renderFieldError('offerHours')}
                <p className="mt-1 text-[10px] text-text-dim font-code-hash">
                  Cutoff: {formatDate(timestamps.offerExpiry)}
                </p>
              </div>

              <div>
                <label htmlFor="input-performance-days" className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  Performance Window (Days) <span className="text-status-error">*</span>
                </label>
                <input
                  id="input-performance-days"
                  ref={el => { fieldRefs.current.performanceDays = el }}
                  inputMode="numeric"
                  value={performanceDays}
                  onChange={e => setPerformanceDays(e.target.value)}
                  onBlur={() => touchField('performanceDays')}
                  aria-invalid={Boolean(visibleFieldError('performanceDays'))}
                  aria-describedby={visibleFieldError('performanceDays') ? errorId('performanceDays') : undefined}
                  className={fieldClassFor('performanceDays')}
                />
                {renderFieldError('performanceDays')}
                <p className="mt-1 text-[10px] text-text-dim font-code-hash">
                  Cutoff: {formatDate(timestamps.performanceDeadline)}
                </p>
              </div>

              <div>
                <label htmlFor="input-dispute-days" className="block font-label-caps text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  Dispute Window (Days) <span className="text-status-error">*</span>
                </label>
                <input
                  id="input-dispute-days"
                  ref={el => { fieldRefs.current.disputeDays = el }}
                  inputMode="numeric"
                  value={disputeDays}
                  onChange={e => setDisputeDays(e.target.value)}
                  onBlur={() => touchField('disputeDays')}
                  aria-invalid={Boolean(visibleFieldError('disputeDays'))}
                  aria-describedby={visibleFieldError('disputeDays') ? errorId('disputeDays') : undefined}
                  className={fieldClassFor('disputeDays')}
                />
                {renderFieldError('disputeDays')}
                <p className="mt-1 text-[10px] text-text-dim font-code-hash">
                  Cutoff: {formatDate(timestamps.disputeDeadline)}
                </p>
              </div>
            </div>

            {/* Privacy Checkbox */}
            <div className="pt-2">
              <label className="flex items-center gap-2.5 text-[11px] font-body-sans text-text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={blurSize}
                  onChange={e => setBlurSize(e.target.checked)}
                  className="accent-[#c8f542] h-4 w-4 rounded-[2px]"
                />
                <span>Blur collateral amount in public tape feed (Cosmetic UI only; on-chain ledger remains public)</span>
              </label>
            </div>

            {/* Step 3 Actions */}
            <div className="pt-4 border-t border-outline-hairline flex items-center justify-between">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="pact-button-secondary min-h-[42px] px-5 text-[11px] uppercase tracking-wider"
              >
                ← Back to Collateral
              </button>
              <button
                type="button"
                onClick={() => goToStep(4)}
                className="pact-button-primary min-h-[42px] px-6 text-[12px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
              >
                <span>Continue to Pre-Flight Review</span>
                <span>→</span>
              </button>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: PRE-FLIGHT REVIEW & AUTHORIZATION */}
        {/* ========================================================================= */}
        {currentStep === 4 && (
          <section aria-labelledby="step-4-title" className="border border-outline-border bg-[#0c0f12] p-5 sm:p-6 animate-enter space-y-6">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-hairline">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center bg-primary-fixed text-black font-display-mono text-[11px] font-bold">4</span>
                <h2 id="step-4-title" className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">
                  Pre-Flight Review & On-Chain Commit
                </h2>
              </div>
              <span className="text-[10px] font-label-caps uppercase text-text-dim">Final Verification</span>
            </div>

            {/* Section A: Public On-Chain Data */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-headline-mono font-bold uppercase tracking-wider text-primary-fixed flex items-center gap-1.5">
                  <span>🌐</span>
                  <span>Public On-Chain Ledger Data</span>
                </h3>
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="text-[10px] font-code-hash text-primary-fixed hover:underline"
                >
                  Edit Parties ✎
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 p-4 border border-outline-hairline bg-[#07080a] text-[12px] font-code-hash">
                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Maker (Depositor)</span>
                  <div className="flex items-center gap-1.5">
                    <RoleBadge role="MAKER" isCurrentUser={true} size="xs" />
                    {address ? (
                      <AddressDisplay address={address} showCopy={true} showExplorer={false} />
                    ) : (
                      <span className="text-amber-400">Disconnected</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Counterparty (Taker)</span>
                  <div className="flex items-center gap-1.5">
                    <RoleBadge role="TAKER" isCurrentUser={false} size="xs" />
                    {isAddress(taker) ? (
                      <AddressDisplay address={taker} showCopy={true} showExplorer={false} />
                    ) : (
                      <span className="text-status-error">Missing / Invalid</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Designated Arbiter</span>
                  <div className="flex items-center gap-1.5">
                    <RoleBadge role="ARBITER" isCurrentUser={false} size="xs" />
                    {isAddress(arbiter) ? (
                      <AddressDisplay address={arbiter} showCopy={true} showExplorer={false} />
                    ) : (
                      <span className="text-status-error">Missing / Invalid</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Agreement Type</span>
                  <span className="text-white font-bold">{KINDS.find(k => k.value === kind)?.label}</span>
                </div>

                <div className="pt-2 border-t border-outline-hairline/60">
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Maker Collateral to Lock</span>
                  <span className="text-primary-fixed font-bold text-[14px]">
                    {amountMaker || '0'} {TOKENS.find(t => t.value === tokenMaker)?.label}
                  </span>
                </div>

                <div className="pt-2 border-t border-outline-hairline/60">
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Required Taker Collateral</span>
                  <span className="text-white font-bold text-[14px]">
                    {amountTaker ? `${amountTaker} ${TOKENS.find(t => t.value === tokenTaker)?.label}` : 'None (0.00)'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">5% Dispute Bond</span>
                  <span className="text-white">{formatUnits(calculatedBond, 6)} USDC</span>
                </div>

                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Arbiter Fee Cap</span>
                  <span className="text-white">{arbiterFeeCap || '0'} USDC</span>
                </div>

                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Offer Expiration Date</span>
                  <span className="text-white">{formatDate(timestamps.offerExpiry)}</span>
                </div>

                <div>
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Performance Deadline</span>
                  <span className="text-white">{formatDate(timestamps.performanceDeadline)}</span>
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-outline-hairline/60">
                  <span className="text-[10px] font-label-caps uppercase text-text-dim block mb-1">Canonical SHA-256 Terms Hash</span>
                  <span className="text-primary-fixed text-[11px] break-all font-mono">
                    {canonicalTermsHash || 'Pending complete required fields'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section B: Private Off-Chain Terms Preview */}
            <div className="space-y-3 pt-2 border-t border-outline-hairline/60">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-headline-mono font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <span>📄</span>
                  <span>Written Agreement Terms (Off-Chain Content)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="text-[10px] font-code-hash text-primary-fixed hover:underline"
                >
                  Edit Terms ✎
                </button>
              </div>

              <div className="p-3.5 border border-outline-hairline bg-[#07080a] max-h-40 overflow-y-auto font-body-sans text-[12px] text-text-muted leading-relaxed whitespace-pre-wrap rounded-[1px]">
                {terms.trim() ? terms : <span className="text-status-error italic">No terms entered yet.</span>}
              </div>
              <p className="text-[10px] text-text-dim font-body-sans">
                ℹ️ The text above is verified client-side. Only its 32-byte cryptographic SHA-256 hash is anchored on Arc Testnet.
              </p>
            </div>

            {/* Form-Wide Validation Errors Alert */}
            {submitAttempted && validationError && (
              <div role="alert" className="border border-status-error/60 bg-status-error/10 p-4 text-[12px] text-status-error font-code-hash space-y-2 animate-enter">
                <div className="flex items-center gap-2 font-bold">
                  <span>⚠️</span>
                  <span>Please resolve the following before signing:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[11px]">
                  {NEW_PACT_FIELD_ORDER.filter(field => fieldErrors[field]).map(field => (
                    <li key={field}>{fieldErrors[field]}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Signing Notice */}
            <p className="text-[11px] leading-5 font-body-sans text-text-dim">
              🔒 <strong className="text-text-muted">Direct Protocol Lock:</strong> Clicking below will prompt your wallet to authorize exact collateral and commit the pact on-chain.
            </p>

            {/* Step 4 Actions */}
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="pact-button-secondary min-h-[44px] w-full sm:w-auto px-5 text-[11px] uppercase tracking-wider"
              >
                ← Back to Terms
              </button>

              <button
                type="submit"
                disabled={busy}
                className="pact-button-primary min-h-[48px] w-full sm:w-auto px-8 text-[12px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(243,232,140,0.15)]"
              >
                {phase === 'approving'
                  ? 'Authorizing exact collateral…'
                  : phase === 'creating'
                  ? 'Creating pact & locking escrow…'
                  : !isConnected
                  ? 'Connect Wallet to Sign'
                  : 'Authorize & Lock Collateral →'}
              </button>
            </div>

            <TransactionProgress
              stage={txStage}
              label={txLabel}
              hash={txHash}
              error={txError}
              onDismiss={() => {
                setTxStage('idle')
                setTxError('')
                setTxHash(null)
              }}
            />
          </section>
        )}
      </form>
    </div>
  )
}
