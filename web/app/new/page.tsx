'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { decodeEventLog, formatUnits, isAddress, parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from 'wagmi'
import { useModal } from 'connectkit'
import { toast } from 'sonner'
import { ERC20_ABI, PACT_ABI } from '../../lib/abi'
import { CIRCLE_FAUCET_URL, EURC, USDC_ERC20, arcTestnet, getPactAddress } from '../../lib/arc'
import { hashPactTerms, hashTerms } from '../../lib/terms'
import { signPermit, type PermitAuthorization } from '../../lib/permit'
import { fetchReputation } from '../../lib/reads'
import { NEW_PACT_FIELD_ORDER, validateNewPactForm, type NewPactField } from '../../lib/newPactValidation'
import TokenSelect from '../../components/TokenSelect'
import TransactionProgress, { type TransactionStage } from '../../components/TransactionProgress'
import { transactionErrorMessage } from '../../lib/transactionErrors'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const KINDS = [
  { value: 0, label: 'Delivery', desc: 'Buyer escrows payment; seller proves delivery.' },
  { value: 1, label: 'Job', desc: 'Client escrows a bounty for verifiable work.' },
] as const
const TOKENS = [
  { value: USDC_ERC20, label: 'USDC' },
  { value: EURC, label: 'EURC' },
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
  const [kind, setKind] = useState(0)
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
    document.title = 'PACT · New Pact'
  }, [])

  useEffect(() => {
    if (!isAddress(taker)) {
      setReputation(null)
      return
    }
    let cancelled = false
    fetchReputation(taker).then(value => !cancelled && setReputation(value))
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
    return { offerExpiry: BigInt(Math.floor(offerExpiry)), performanceDeadline: BigInt(Math.floor(performanceDeadline)), disputeDeadline: BigInt(Math.floor(disputeDeadline)) }
  }, [offerHours, performanceDays, disputeDays])

  const calculatedBond = notionalAmount > 0n
    ? ((notionalAmount * 500n + 9_999n) / 10_000n < 1_000_000n ? 1_000_000n : (notionalAmount * 500n + 9_999n) / 10_000n)
    : 0n

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

  function visibleFieldError(field: NewPactField) {
    return submitAttempted || touchedFields[field] ? fieldErrors[field] : undefined
  }

  function focusFirstInvalidField() {
    const firstInvalid = NEW_PACT_FIELD_ORDER.find(field => fieldErrors[field])
    if (!firstInvalid) return
    requestAnimationFrame(() => fieldRefs.current[firstInvalid]?.focus())
  }

  const createArgs = useMemo(() => [
    kind,
    taker as `0x${string}`,
    arbiter as `0x${string}`,
    tokenMaker,
    takerAmount > 0n ? tokenTaker : ZERO_ADDRESS,
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
    if (validationError || !address || !protocolAddress || !publicClient || !walletClient) {
      toast.error(validationError || 'Wallet client is not ready')
      focusFirstInvalidField()
      return
    }

    try {
      let permit: PermitAuthorization | null = null
      if (allowance !== makerAmount) {
        setPhase('approving')
        setTxStage('awaiting-signature')
        setTxLabel('Authorize the exact collateral amount. PACT never requests an unlimited allowance.')
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
          setTxLabel('The exact token approval is being confirmed on Arc Testnet.')
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
          // Reset stale/non-zero approval first to avoid ERC-20 allowance races.
          if (allowance !== 0n) await approve(0n)
          await approve(makerAmount)
          await refetchAllowance()
        }
      }

      setPhase('creating')
      setTxStage('awaiting-signature')
      setTxLabel('Confirm creation of the committed pact offer in your wallet.')
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
      setTxLabel('Maker collateral is being escrowed and the pact is being recorded on-chain.')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: creationHash })
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: PACT_ABI, data: log.data, topics: log.topics })
          if (decoded.eventName === 'PactCreated') setCreatedPactId(Number(decoded.args.id))
        } catch { /* unrelated log */ }
      }
      setPhase('done')
      setTxStage('success')
      setTxLabel('The pact offer is live and maker collateral is escrowed.')
      toast.success('Pact offer created and maker collateral escrowed')
    } catch (error) {
      const message = transactionErrorMessage(error)
      setPhase('idle')
      setTxStage('error')
      setTxError(message)
      toast.error(message)
    }
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-[580px] border border-outline-hairline bg-surface-container-lowest p-8 text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center bg-primary-fixed text-xl font-bold text-black">✓</div>
        <h1 className="text-xl font-semibold text-white">Pact offer created</h1>
        <p className="mt-2 text-sm text-text-muted">Maker collateral is escrowed. The designated counterparty must verify the exact terms hash before accepting.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 @sm:flex-row">
          {createdPactId && <Link href={`/p/${createdPactId}`} className="btn-primary px-5 py-2.5">Open pact →</Link>}
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="btn-ghost px-5 py-2.5">ArcScan ↗</a>}
        </div>
        <TransactionProgress stage={txStage} label={txLabel} hash={txHash} error={txError} />
      </div>
    )
  }

  const fieldClass = 'w-full border bg-[#07080a] px-3.5 py-2.5 text-[13px] text-white outline-none'
  const fieldClassFor = (field: NewPactField) => `${fieldClass} ${visibleFieldError(field) ? 'border-status-error focus:border-status-error' : 'border-zinc-800 focus:border-primary-fixed'}`
  const errorId = (field: NewPactField) => `${field}-error`
  const renderFieldError = (field: NewPactField) => {
    const error = visibleFieldError(field)
    return error ? <span id={errorId(field)} className="mt-1.5 block text-[11px] leading-4 text-status-error">{error}</span> : null
  }
  const busy = phase !== 'idle'

  return (
    <div className="mx-auto w-full max-w-[920px] font-mono">
      <div className="mb-6 flex flex-col gap-3 border border-primary-fixed/30 bg-primary-fixed/[0.06] p-4 @sm:flex-row @sm:items-center @sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold text-primary-fixed">Arc Testnet · ERC-20 collateral only</p>
          <p className="mt-1 text-[11px] text-text-muted">No native transfers, no client-side deployment, no user-supplied contract address.</p>
        </div>
        <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noopener noreferrer" className="pact-button-secondary shrink-0 px-3">Get test USDC ↗</a>
      </div>

      {!protocolAddress && (
        <div role="alert" className="mb-6 border border-status-warning/60 bg-status-warning/10 p-4 text-[12px] text-[#f7d36b]">
          <strong>Protocol unavailable.</strong> A maintainer must deploy PACT V1 and configure `NEXT_PUBLIC_PACT_ADDRESS_5042002` before transactions are enabled.
        </div>
      )}

      <header className="mb-8 border-b border-outline-hairline pb-5">
        <p className="pact-eyebrow mb-2">Create committed offer</p>
        <h1 className="text-[28px] font-semibold text-white">New pact</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-text-muted">Creating immediately escrows maker collateral. Acceptance atomically escrows counterparty collateral only after the terms hash matches.</p>
      </header>

      <div className="space-y-7">
        <section className="pact-panel p-5">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-white">01 · Structure and parties</h2>
          <div className="mb-5 grid gap-2 @sm:grid-cols-2">
            {KINDS.map(option => <button key={option.value} type="button" onClick={() => setKind(option.value)} className={`border p-4 text-left ${kind === option.value ? 'border-primary-fixed bg-primary-fixed/[0.06]' : 'border-zinc-800'}`}><span className="block text-sm text-white">{option.label}</span><span className="mt-1 block text-[11px] text-text-muted">{option.desc}</span></button>)}
          </div>
          <div className="grid gap-4 @sm:grid-cols-2">
            <label className="text-[11px] text-text-muted">Designated counterparty<input ref={element => { fieldRefs.current.taker = element }} value={taker} onChange={event => setTaker(event.target.value)} onBlur={() => touchField('taker')} aria-invalid={Boolean(visibleFieldError('taker'))} aria-describedby={visibleFieldError('taker') ? errorId('taker') : undefined} placeholder="0x…" className={`${fieldClassFor('taker')} mt-2`} />{renderFieldError('taker')}</label>
            <label className="text-[11px] text-text-muted">Designated arbiter<input ref={element => { fieldRefs.current.arbiter = element }} value={arbiter} onChange={event => setArbiter(event.target.value)} onBlur={() => touchField('arbiter')} aria-invalid={Boolean(visibleFieldError('arbiter'))} aria-describedby={visibleFieldError('arbiter') ? errorId('arbiter') : undefined} placeholder="0x…" className={`${fieldClassFor('arbiter')} mt-2`} />{renderFieldError('arbiter')}</label>
          </div>
          {reputation && <p className="mt-3 text-[11px] text-text-muted">Counterparty history: <span className="text-primary-fixed">{reputation.cleared} settled</span> · {reputation.slashed} disputes lost</p>}
        </section>

        <section className="pact-panel p-5">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-white">02 · Collateral and dispute economics</h2>
          <div className="grid gap-4 @sm:grid-cols-2">
            <TokenSelect label="Maker token" value={tokenMaker} onChange={value => setTokenMaker(value as `0x${string}`)} tokens={TOKENS} />
            <label className="text-[11px] text-text-muted">Maker collateral<input ref={element => { fieldRefs.current.amountMaker = element }} inputMode="decimal" value={amountMaker} onChange={event => setAmountMaker(event.target.value)} onBlur={() => touchField('amountMaker')} aria-invalid={Boolean(visibleFieldError('amountMaker'))} aria-describedby={visibleFieldError('amountMaker') ? errorId('amountMaker') : undefined} placeholder="0.00" className={`${fieldClassFor('amountMaker')} mt-2`} />{renderFieldError('amountMaker')}</label>
            <TokenSelect label="Counterparty token" value={tokenTaker} onChange={value => setTokenTaker(value as `0x${string}`)} tokens={TOKENS} />
            <label className="text-[11px] text-text-muted">Counterparty collateral<input ref={element => { fieldRefs.current.amountTaker = element }} inputMode="decimal" value={amountTaker} onChange={event => setAmountTaker(event.target.value)} onBlur={() => touchField('amountTaker')} aria-invalid={Boolean(visibleFieldError('amountTaker'))} aria-describedby={visibleFieldError('amountTaker') ? errorId('amountTaker') : undefined} placeholder="0.00 (optional)" className={`${fieldClassFor('amountTaker')} mt-2`} />{renderFieldError('amountTaker')}</label>
            <label className="text-[11px] text-text-muted">Notional value in USDC<input ref={element => { fieldRefs.current.notionalUSDC = element }} inputMode="decimal" value={notionalUSDC} onChange={event => setNotionalUSDC(event.target.value)} onBlur={() => touchField('notionalUSDC')} aria-invalid={Boolean(visibleFieldError('notionalUSDC'))} aria-describedby={visibleFieldError('notionalUSDC') ? errorId('notionalUSDC') : undefined} placeholder="Used once to calculate the 5% bond" className={`${fieldClassFor('notionalUSDC')} mt-2`} />{renderFieldError('notionalUSDC')}</label>
            <label className="text-[11px] text-text-muted">Arbiter fee cap (USDC)<input ref={element => { fieldRefs.current.arbiterFeeCap = element }} inputMode="decimal" value={arbiterFeeCap} onChange={event => setArbiterFeeCap(event.target.value)} onBlur={() => touchField('arbiterFeeCap')} aria-invalid={Boolean(visibleFieldError('arbiterFeeCap'))} aria-describedby={visibleFieldError('arbiterFeeCap') ? errorId('arbiterFeeCap') : undefined} className={`${fieldClassFor('arbiterFeeCap')} mt-2`} />{renderFieldError('arbiterFeeCap')}</label>
          </div>
          <p className="mt-4 border-l-2 border-primary-fixed pl-3 text-[11px] leading-5 text-text-muted">Dispute bond: <strong className="text-primary-fixed">{formatUnits(calculatedBond, 6)} USDC</strong>. Both parties post the same bond; arbiter fees can only come from the losing bond.</p>
        </section>

        <section className="pact-panel p-5">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-white">03 · Deadlines and written terms</h2>
          <div className="grid gap-4 @sm:grid-cols-3">
            <label className="text-[11px] text-text-muted">Offer expires (hours)<input ref={element => { fieldRefs.current.offerHours = element }} inputMode="numeric" value={offerHours} onChange={event => setOfferHours(event.target.value)} onBlur={() => touchField('offerHours')} aria-invalid={Boolean(visibleFieldError('offerHours'))} aria-describedby={visibleFieldError('offerHours') ? errorId('offerHours') : undefined} className={`${fieldClassFor('offerHours')} mt-2`} />{renderFieldError('offerHours')}</label>
            <label className="text-[11px] text-text-muted">Performance window (days)<input ref={element => { fieldRefs.current.performanceDays = element }} inputMode="numeric" value={performanceDays} onChange={event => setPerformanceDays(event.target.value)} onBlur={() => touchField('performanceDays')} aria-invalid={Boolean(visibleFieldError('performanceDays'))} aria-describedby={visibleFieldError('performanceDays') ? errorId('performanceDays') : undefined} className={`${fieldClassFor('performanceDays')} mt-2`} />{renderFieldError('performanceDays')}</label>
            <label className="text-[11px] text-text-muted">Dispute window (days)<input ref={element => { fieldRefs.current.disputeDays = element }} inputMode="numeric" value={disputeDays} onChange={event => setDisputeDays(event.target.value)} onBlur={() => touchField('disputeDays')} aria-invalid={Boolean(visibleFieldError('disputeDays'))} aria-describedby={visibleFieldError('disputeDays') ? errorId('disputeDays') : undefined} className={`${fieldClassFor('disputeDays')} mt-2`} />{renderFieldError('disputeDays')}</label>
          </div>
          <label className="mt-5 block text-[11px] text-text-muted">Agreement terms<textarea ref={element => { fieldRefs.current.terms = element }} value={terms} onChange={event => setTerms(event.target.value)} onBlur={() => touchField('terms')} aria-invalid={Boolean(visibleFieldError('terms'))} aria-describedby={visibleFieldError('terms') ? errorId('terms') : undefined} maxLength={2000} rows={6} placeholder="Exact off-chain agreement anchored by termsHash…" className={`${fieldClassFor('terms')} mt-2 resize-y`} />{renderFieldError('terms')}</label>
          <label className="mt-4 flex items-center gap-2 text-[11px] text-text-muted"><input type="checkbox" checked={blurSize} onChange={event => setBlurSize(event.target.checked)} /> Blur amount in UI (cosmetic only; on-chain data remains public)</label>
        </section>

        <section className="border border-zinc-800 bg-[#0c0d10] p-5">
          <div className="grid gap-3 text-[11px] text-text-muted @sm:grid-cols-2">
            <p>Canonical terms hash <span className="mt-1 block break-all text-white">{canonicalTermsHash || 'Connect wallet and complete all fields'}</span></p>
            <p>Official contract <span className="mt-1 block break-all text-white">{protocolAddress ?? 'Not configured'}</span></p>
            <p>Maker locks now <span className="mt-1 block text-primary-fixed">{amountMaker || '0'} {TOKENS.find(token => token.value === tokenMaker)?.label}</span></p>
            <p>Offer / performance / dispute <span className="mt-1 block text-white">{offerHours}h / {performanceDays}d / +{disputeDays}d</span></p>
          </div>
          {submitAttempted && validationError && (
            <div role="alert" className="mt-4 border border-status-error/60 bg-status-error/10 p-3 text-[11px] text-status-error">
              <p className="font-semibold">Please correct the highlighted fields before creating this pact.</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {NEW_PACT_FIELD_ORDER.filter(field => fieldErrors[field]).map(field => <li key={field}>{fieldErrors[field]}</li>)}
              </ul>
            </div>
          )}
          <button type="button" onClick={submitPact} disabled={busy} className="btn-primary mt-5 min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-40">
            {phase === 'approving' ? 'Authorizing exact collateral…' : phase === 'creating' ? 'Creating committed offer…' : !isConnected ? 'Connect wallet' : 'Authorize & create pact'}
          </button>
          <TransactionProgress stage={txStage} label={txLabel} hash={txHash} error={txError} onDismiss={() => { setTxStage('idle'); setTxError(''); setTxHash(null) }} />
        </section>
      </div>
    </div>
  )
}
