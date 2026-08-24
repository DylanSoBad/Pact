'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { decodeEventLog, formatUnits, isAddress, parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from 'wagmi'
import { useModal } from 'connectkit'
import { toast } from 'sonner'
import { ERC20_ABI, PACT_ABI } from '../../lib/abi'
import { CIRCLE_FAUCET_URL, EURC, USDC_ERC20, arcTestnet, getPactAddress } from '../../lib/arc'
import { hashPactTerms, hashTerms } from '../../lib/terms'
import { signPermit, type PermitAuthorization } from '../../lib/permit'
import { fetchReputation } from '../../lib/reads'
import TokenSelect from '../../components/TokenSelect'

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
  const [createdPactId, setCreatedPactId] = useState<number | null>(null)
  const [reputation, setReputation] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)

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
    const offerExpiry = now + Math.max(0, Number(offerHours)) * 60 * 60
    const performanceDeadline = offerExpiry + Math.max(0, Number(performanceDays)) * 24 * 60 * 60
    const disputeDeadline = performanceDeadline + Math.max(0, Number(disputeDays)) * 24 * 60 * 60
    return { offerExpiry: BigInt(Math.floor(offerExpiry)), performanceDeadline: BigInt(Math.floor(performanceDeadline)), disputeDeadline: BigInt(Math.floor(disputeDeadline)) }
  }, [offerHours, performanceDays, disputeDays])

  const calculatedBond = notionalAmount > 0n
    ? ((notionalAmount * 500n + 9_999n) / 10_000n < 1_000_000n ? 1_000_000n : (notionalAmount * 500n + 9_999n) / 10_000n)
    : 0n

  const validationError = useMemo(() => {
    if (!protocolAddress) return 'Official testnet contract is not configured in this build'
    if (!isAddress(taker) || taker === ZERO_ADDRESS) return 'A designated counterparty is required'
    if (!isAddress(arbiter) || arbiter === ZERO_ADDRESS) return 'A designated arbiter is required'
    if (address && [taker.toLowerCase(), arbiter.toLowerCase()].includes(address.toLowerCase())) return 'Maker, counterparty and arbiter must be different addresses'
    if (taker.toLowerCase() === arbiter.toLowerCase()) return 'Counterparty and arbiter must be different addresses'
    if (makerAmount <= 0n) return 'Maker collateral must be greater than zero'
    if (notionalAmount <= 0n) return 'USDC notional must be greater than zero'
    if (feeCapAmount > calculatedBond) return 'Arbiter fee cap cannot exceed the dispute bond'
    if (!terms.trim()) return 'Written agreement terms are required'
    if (Number(offerHours) <= 0 || Number(performanceDays) <= 0 || Number(disputeDays) <= 0) return 'All deadline windows must be greater than zero'
    if (isConnected && makerAmount > makerBalance) return 'Insufficient maker collateral balance'
    return ''
  }, [address, arbiter, calculatedBond, disputeDays, feeCapAmount, isConnected, makerAmount, makerBalance, notionalAmount, offerHours, performanceDays, protocolAddress, taker, terms])

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
    if (validationError || !address || !protocolAddress || !publicClient || !walletClient) {
      toast.error(validationError || 'Wallet client is not ready')
      return
    }

    try {
      let permit: PermitAuthorization | null = null
      if (allowance !== makerAmount) {
        setPhase('approving')
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
      const simulation = await publicClient.simulateContract({
        account: address,
        address: protocolAddress,
        abi: PACT_ABI,
        functionName: permit ? 'createPactWithPermit' : 'createPact',
        args: permit ? [...createArgs, permit.deadline, permit.v, permit.r, permit.s] : createArgs,
      } as never)
      const creationHash = await walletClient.writeContract(simulation.request)
      setTxHash(creationHash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: creationHash })
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: PACT_ABI, data: log.data, topics: log.topics })
          if (decoded.eventName === 'PactCreated') setCreatedPactId(Number(decoded.args.id))
        } catch { /* unrelated log */ }
      }
      setPhase('done')
      toast.success('Pact offer created and maker collateral escrowed')
    } catch (error) {
      setPhase('idle')
      toast.error(error instanceof Error ? error.message : 'Transaction failed')
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
      </div>
    )
  }

  const fieldClass = 'w-full border border-zinc-800 bg-[#07080a] px-3.5 py-2.5 text-[13px] text-white outline-none focus:border-primary-fixed'
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
            <label className="text-[11px] text-text-muted">Designated counterparty<input value={taker} onChange={event => setTaker(event.target.value)} placeholder="0x…" className={`${fieldClass} mt-2`} /></label>
            <label className="text-[11px] text-text-muted">Designated arbiter<input value={arbiter} onChange={event => setArbiter(event.target.value)} placeholder="0x…" className={`${fieldClass} mt-2`} /></label>
          </div>
          {reputation && <p className="mt-3 text-[11px] text-text-muted">Counterparty history: <span className="text-primary-fixed">{reputation.cleared} settled</span> · {reputation.slashed} disputes lost</p>}
        </section>

        <section className="pact-panel p-5">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-white">02 · Collateral and dispute economics</h2>
          <div className="grid gap-4 @sm:grid-cols-2">
            <TokenSelect label="Maker token" value={tokenMaker} onChange={value => setTokenMaker(value as `0x${string}`)} tokens={TOKENS} />
            <label className="text-[11px] text-text-muted">Maker collateral<input inputMode="decimal" value={amountMaker} onChange={event => setAmountMaker(event.target.value)} placeholder="0.00" className={`${fieldClass} mt-2`} /></label>
            <TokenSelect label="Counterparty token" value={tokenTaker} onChange={value => setTokenTaker(value as `0x${string}`)} tokens={TOKENS} />
            <label className="text-[11px] text-text-muted">Counterparty collateral<input inputMode="decimal" value={amountTaker} onChange={event => setAmountTaker(event.target.value)} placeholder="0.00 (optional)" className={`${fieldClass} mt-2`} /></label>
            <label className="text-[11px] text-text-muted">Notional value in USDC<input inputMode="decimal" value={notionalUSDC} onChange={event => setNotionalUSDC(event.target.value)} placeholder="Used once to calculate the 5% bond" className={`${fieldClass} mt-2`} /></label>
            <label className="text-[11px] text-text-muted">Arbiter fee cap (USDC)<input inputMode="decimal" value={arbiterFeeCap} onChange={event => setArbiterFeeCap(event.target.value)} className={`${fieldClass} mt-2`} /></label>
          </div>
          <p className="mt-4 border-l-2 border-primary-fixed pl-3 text-[11px] leading-5 text-text-muted">Dispute bond: <strong className="text-primary-fixed">{formatUnits(calculatedBond, 6)} USDC</strong>. Both parties post the same bond; arbiter fees can only come from the losing bond.</p>
        </section>

        <section className="pact-panel p-5">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-white">03 · Deadlines and written terms</h2>
          <div className="grid gap-4 @sm:grid-cols-3">
            <label className="text-[11px] text-text-muted">Offer expires (hours)<input inputMode="numeric" value={offerHours} onChange={event => setOfferHours(event.target.value)} className={`${fieldClass} mt-2`} /></label>
            <label className="text-[11px] text-text-muted">Performance window (days)<input inputMode="numeric" value={performanceDays} onChange={event => setPerformanceDays(event.target.value)} className={`${fieldClass} mt-2`} /></label>
            <label className="text-[11px] text-text-muted">Dispute window (days)<input inputMode="numeric" value={disputeDays} onChange={event => setDisputeDays(event.target.value)} className={`${fieldClass} mt-2`} /></label>
          </div>
          <label className="mt-5 block text-[11px] text-text-muted">Agreement terms<textarea value={terms} onChange={event => setTerms(event.target.value)} maxLength={2000} rows={6} placeholder="Exact off-chain agreement anchored by termsHash…" className={`${fieldClass} mt-2 resize-y`} /></label>
          <label className="mt-4 flex items-center gap-2 text-[11px] text-text-muted"><input type="checkbox" checked={blurSize} onChange={event => setBlurSize(event.target.checked)} /> Blur amount in UI (cosmetic only; on-chain data remains public)</label>
        </section>

        <section className="border border-zinc-800 bg-[#0c0d10] p-5">
          <div className="grid gap-3 text-[11px] text-text-muted @sm:grid-cols-2">
            <p>Canonical terms hash <span className="mt-1 block break-all text-white">{canonicalTermsHash || 'Connect wallet and complete all fields'}</span></p>
            <p>Official contract <span className="mt-1 block break-all text-white">{protocolAddress ?? 'Not configured'}</span></p>
            <p>Maker locks now <span className="mt-1 block text-primary-fixed">{amountMaker || '0'} {TOKENS.find(token => token.value === tokenMaker)?.label}</span></p>
            <p>Offer / performance / dispute <span className="mt-1 block text-white">{offerHours}h / {performanceDays}d / +{disputeDays}d</span></p>
          </div>
          {validationError && <p role="alert" className="mt-4 text-[11px] text-status-error">{validationError}</p>}
          <button type="button" onClick={submitPact} disabled={busy || Boolean(validationError)} className="btn-primary mt-5 min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-40">
            {phase === 'approving' ? 'Authorizing exact collateral…' : phase === 'creating' ? 'Creating committed offer…' : !isConnected ? 'Connect wallet' : 'Authorize & create pact'}
          </button>
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-3 block text-center text-[11px] text-text-muted hover:text-primary-fixed">Track current transaction on ArcScan ↗</a>}
        </section>
      </div>
    </div>
  )
}
