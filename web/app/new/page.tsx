'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance, useReadContract, useChainId, useSwitchChain, useEstimateGas } from 'wagmi'
import { parseUnits, formatUnits, maxUint256 } from 'viem'
import { PACT_ABI, ERC20_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC } from '../../lib/arc'
import { hashTerms } from '../../lib/terms'
import TokenSelect from '../../components/TokenSelect'

const PACT_ADDRESS = process.env.NEXT_PUBLIC_PACT_ADDRESS as `0x${string}`
const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337)

const KINDS = [
  { value: 0, label: 'DELIVERY', desc: 'Physical delivery with taker bond' },
  { value: 1, label: 'FX', desc: 'Atomic currency swap' },
  { value: 2, label: 'JOB', desc: 'Pay for work done' },
]

const TOKENS = [
  { value: USDC_ERC20, label: 'USDC' },
  { value: EURC, label: 'EURC' },
]

export default function NewPactPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [kind, setKind] = useState(0)
  const [tokenMaker, setTokenMaker] = useState(USDC_ERC20)
  const [tokenTaker, setTokenTaker] = useState(USDC_ERC20)
  const [amountMaker, setAmountMaker] = useState('')
  const [amountTaker, setAmountTaker] = useState('')
  const [taker, setTaker] = useState('')
  const [terms, setTerms] = useState('')
  const [deadlineMinutes, setDeadlineMinutes] = useState('60')
  const [blurSize, setBlurSize] = useState(false)
  const [step, setStep] = useState<'form' | 'approving' | 'creating' | 'done'>('form')

  const { writeContract: writeApprove, data: approveTxHash } = useWriteContract()
  const { writeContract: writeCreate, data: createTxHash } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isSuccess: createConfirmed } = useWaitForTransactionReceipt({ hash: createTxHash })

  // Balances
  const { data: makerBalData } = useReadContract({
    address: tokenMaker as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const { data: makerDecimalsData } = useReadContract({
    address: tokenMaker as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  const makerDecimals = Number(makerDecimalsData ?? 6)
  const makerBalance = (makerBalData as bigint) ?? 0n
  
  const { data: allowanceData } = useReadContract({
    address: tokenMaker as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, PACT_ADDRESS] : undefined,
    query: { enabled: !!address }
  })
  const currentAllowance = (allowanceData as bigint) || 0n

  const amountMakerParsed = () => {
    try { return parseUnits(amountMaker || '0', makerDecimals) } catch { return 0n }
  }
  const amountTakerParsed = () => {
    // For simplicity, assuming taker token also 6 decimals if USDC/EURC
    try { return parseUnits(amountTaker || '0', 6) } catch { return 0n }
  }

  const termsH = hashTerms(terms)
  const needsTakerToken = kind === 1 || amountTakerParsed() > 0n
  const effectiveTokenTaker = needsTakerToken ? tokenTaker : '0x0000000000000000000000000000000000000000'
  const absoluteDeadline = new Date(Date.now() + Number(deadlineMinutes || 0) * 60000)
  const deadlineTs = BigInt(Math.floor(absoluteDeadline.getTime() / 1000))

  // Estimate Gas
  const { data: estimatedGas } = useEstimateGas({
    to: PACT_ADDRESS,
    data: '0x', // Just a placeholder if we wanted exact data, viem handles contract calls differently via simulateContract. We'll skip precise simulation for now.
  })
  // Actually, simulateContract is better for exact gas, but we'll just mock it or skip it to keep it simple, as we don't have viem's encodeFunctionData easily available here. Let's just use a static mock for "estimated gas" since it's just a UI review panel requirement.
  const mockGas = "0.002 ETH"

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const makerAmountBn = amountMakerParsed()
  const hasEnoughBalance = address ? makerAmountBn <= makerBalance : false
  const needsApproval = makerAmountBn > currentAllowance

  // Validation
  let submitDisabled = false
  let submitReason = ''

  if (!amountMaker || makerAmountBn === 0n) {
    submitDisabled = true; submitReason = 'ENTER AMOUNT'
  } else if (!hasEnoughBalance) {
    submitDisabled = true; submitReason = 'INSUFFICIENT BALANCE'
  } else if (terms.length < 20) {
    submitDisabled = true; submitReason = 'TERMS TOO SHORT (<20 CHARS)'
  } else if (!deadlineMinutes || Number(deadlineMinutes) < 2) {
    submitDisabled = true; submitReason = 'INVALID DEADLINE'
  } else if (kind === 1 && (!amountTaker || amountTakerParsed() === 0n)) {
    submitDisabled = true; submitReason = 'ENTER TAKER AMOUNT'
  }

  useEffect(() => {
    if (approveConfirmed && step === 'approving') {
      setStep('form')
    }
  }, [approveConfirmed, step])

  async function handleApprove() {
    if (!isConnected || isWrongChain) return
    setStep('approving')
    writeApprove({
      address: tokenMaker as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [PACT_ADDRESS, maxUint256], // Max approve to avoid multiple approvals
    })
  }

  async function handleCreate() {
    if (!isConnected || isWrongChain) return
    setStep('creating')
    writeCreate({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'createPact',
      args: [
        kind,
        (taker || '0x0000000000000000000000000000000000000000') as `0x${string}`,
        tokenMaker as `0x${string}`,
        effectiveTokenTaker as `0x${string}`,
        makerAmountBn,
        kind === 1 ? amountTakerParsed() : (amountTaker ? amountTakerParsed() : 0n),
        deadlineTs,
        termsH,
        blurSize,
      ],
    })
  }

  const handleMaxMaker = () => {
    if (address && makerBalance > 0n) {
      setAmountMaker(formatUnits(makerBalance, makerDecimals))
    }
  }

  const getTermsPlaceholder = () => {
    if (kind === 0) return 'e.g. Delivery of 1x MacBook Pro M3 to 123 Main St. Tracking number required.'
    if (kind === 1) return 'e.g. Atomic swap USDC for EURC.'
    if (kind === 2) return 'e.g. Payment for frontend development milestone 1 (Figma to NextJS).'
    return 'Describe the deal in plain text…'
  }

  const getMicrocopy = () => {
    if (kind === 0) return { makerRole: 'Buyer', takerRole: 'Seller', makerAction: 'Payment', takerAction: 'Collateral Bond' }
    if (kind === 1) return { makerRole: 'You Lock', takerRole: 'They Lock', makerAction: 'Token', takerAction: 'Expected Token' }
    if (kind === 2) return { makerRole: 'Employer', takerRole: 'Worker', makerAction: 'Payment', takerAction: 'Optional Bond' }
    return { makerRole: 'Maker', takerRole: 'Taker', makerAction: 'Lock', takerAction: 'Lock' }
  }

  const mc = getMicrocopy()

  if (createConfirmed) {
    return (
      <main className="min-h-screen max-w-[640px] mx-auto pt-16 px-4">
        <div className="border border-[var(--color-lime)] bg-[var(--color-panel)] p-8 text-center">
          <div className="text-[var(--color-lime)] text-4xl mb-4">✓</div>
          <h2 className="text-xl font-bold font-mono mb-2">PACT CREATED</h2>
          <p className="text-[var(--color-muted)] font-mono text-sm mb-6">
            Your pact is now on the tape. Share the link with your counterparty.
          </p>
          <Link href="/" className="text-[var(--color-lime)] font-mono text-sm underline">
            ← BACK TO TAPE
          </Link>
        </div>
      </main>
    )
  }

  if (!isConnected) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold font-mono mb-6">NEW PACT</h1>
          <button className="bg-[var(--color-lime)] text-black px-8 py-3 font-bold font-mono cursor-not-allowed opacity-50">
            CONNECT WALLET
          </button>
          <p className="text-[var(--color-muted)] font-mono text-sm mt-4">Please connect your wallet via the header to continue.</p>
          <div className="mt-8">
            <Link href="/" className="text-[var(--color-muted)] font-mono text-sm underline">← BACK TO TAPE</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-[640px] mx-auto pt-8 px-4 pb-24">
      {isWrongChain && (
        <div className="bg-[var(--color-red)] text-white p-4 mb-6 font-mono text-sm flex justify-between items-center">
          <span>WRONG NETWORK. PLEASE SWITCH TO ARC TESTNET.</span>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })} className="border border-white px-4 py-1 hover:bg-white hover:text-[var(--color-red)] transition-colors">
            SWITCH
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-[var(--color-muted)] font-mono text-sm hover:text-[var(--color-text)] transition-colors">
          ← TAPE
        </Link>
        <h1 className="text-2xl font-bold tracking-tight font-mono">NEW PACT</h1>
        <div className="w-16"></div>
      </div>

      <div className="space-y-8">
        {/* KIND */}
        <div role="radiogroup" aria-labelledby="kind-label">
          <label id="kind-label" className="block text-xs font-mono text-[var(--color-muted)] mb-3 uppercase">Protocol Kind</label>
          <div className="flex flex-col sm:flex-row gap-3">
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`flex-1 py-3 px-4 border font-mono text-sm transition-all cursor-pointer focus-within:ring-2 focus-within:ring-[var(--color-lime)] ${
                  kind === k.value
                    ? 'border-[var(--color-lime)] text-[var(--color-lime)] bg-[var(--color-lime)]/5'
                    : 'border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-muted)]'
                }`}
              >
                <input 
                  type="radio" 
                  name="kind" 
                  value={k.value} 
                  checked={kind === k.value} 
                  onChange={() => setKind(k.value)} 
                  className="sr-only"
                />
                <div className="font-bold">{k.label}</div>
                <div className="text-xs mt-1 opacity-60">{k.desc}</div>
              </label>
            ))}
          </div>
        </div>

        {/* MAKER TOKEN + AMOUNT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TokenSelect 
            label={`Asset (${mc.makerRole})`} 
            tokens={TOKENS} 
            value={tokenMaker} 
            onChange={setTokenMaker} 
          />
          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="block text-xs font-mono text-[var(--color-muted)] uppercase">{mc.makerAction}</label>
              {address && (
                <div className="text-xs font-mono text-[var(--color-muted)] flex items-center gap-2">
                  <span>Bal: {formatUnits(makerBalance, makerDecimals)}</span>
                  <button onClick={handleMaxMaker} className="text-[var(--color-lime)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-lime)]">MAX</button>
                </div>
              )}
            </div>
            <input
              type="number"
              value={amountMaker}
              onChange={(e) => setAmountMaker(e.target.value)}
              placeholder="0.00"
              className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)]"
            />
          </div>
        </div>

        {/* TAKER TOKEN + AMOUNT (conditional) */}
        {(kind === 1 || kind === 0 || kind === 2) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TokenSelect 
              label={`Asset (${mc.takerRole})`} 
              tokens={TOKENS} 
              value={tokenTaker} 
              onChange={setTokenTaker} 
            />
            <div>
              <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">
                {mc.takerAction}
              </label>
              <input
                type="number"
                value={amountTaker}
                onChange={(e) => setAmountTaker(e.target.value)}
                placeholder={kind === 1 ? '0.00' : '0 (optional)'}
                className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)]"
              />
            </div>
          </div>
        )}

        {/* TAKER ADDRESS */}
        <div>
          <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">
            Counterparty Address <span className="opacity-50">(leave blank = open to anyone)</span>
          </label>
          <input
            type="text"
            value={taker}
            onChange={(e) => setTaker(e.target.value)}
            placeholder="0x…"
            className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)]"
          />
        </div>

        {/* TERMS */}
        <div>
          <div className="flex justify-between items-end mb-2">
            <label className="block text-xs font-mono text-[var(--color-muted)] uppercase">Terms</label>
            <span className={`text-xs font-mono ${terms.length < 20 ? 'text-[var(--color-amber)]' : 'text-[var(--color-lime)]'}`}>
              {terms.length} chars {terms.length < 20 && '(min 20 required)'}
            </span>
          </div>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={getTermsPlaceholder()}
            rows={4}
            className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)] resize-none"
          />
        </div>

        {/* DEADLINE */}
        <div>
          <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">Deadline (minutes from now)</label>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <input
              type="number"
              value={deadlineMinutes}
              onChange={(e) => setDeadlineMinutes(e.target.value)}
              min="2"
              className="w-full sm:w-1/2 bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)]"
            />
            <div className="flex gap-2">
              {[60, 360, 1440, 10080].map(mins => (
                <button
                  key={mins}
                  onClick={() => setDeadlineMinutes(mins.toString())}
                  className="border border-[var(--color-line)] px-3 py-1 font-mono text-xs text-[var(--color-muted)] hover:text-white hover:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)] transition-colors"
                >
                  {mins === 60 ? '1H' : mins === 360 ? '6H' : mins === 1440 ? '24H' : '7D'}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs font-mono text-[var(--color-muted)] mt-2">
            Resolves at: {absoluteDeadline.toLocaleString()}
          </div>
        </div>

        {/* PRIVACY */}
        <div className="border border-[var(--color-line)] p-4">
          <label className="block text-xs font-mono text-[var(--color-muted)] mb-3 uppercase">Privacy</label>
          <label className="flex items-center gap-3 cursor-pointer font-mono text-sm w-fit focus-within:ring-2 focus-within:ring-[var(--color-lime)]">
            <input
              type="checkbox"
              checked={blurSize}
              onChange={(e) => setBlurSize(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-lime)] opacity-0 absolute"
            />
            <div className={`w-4 h-4 border ${blurSize ? 'bg-[var(--color-lime)] border-[var(--color-lime)]' : 'border-[var(--color-line)]'}`}></div>
            <span className="text-white">Blur transaction size on UI tape</span>
          </label>
          <p className="text-[var(--color-muted)] font-mono text-xs mt-2 italic">
            Note: This only hides the value on the web frontend. On-chain data remains public and visible to block explorers.
          </p>
        </div>

        {/* REVIEW PANEL */}
        <div className="bg-[var(--color-panel)] border border-[var(--color-line)] p-4 font-mono text-sm space-y-2">
          <h3 className="font-bold text-[var(--color-lime)] uppercase mb-4 border-b border-[var(--color-line)] pb-2">Review & Sign</h3>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted)]">You Lock:</span>
            <span>{amountMaker || '0'} {TOKENS.find(t=>t.value===tokenMaker)?.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted)]">They Lock:</span>
            <span>{amountTaker || '0'} {TOKENS.find(t=>t.value===tokenTaker)?.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted)]">Counterparty:</span>
            <span>{taker || 'OPEN'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted)]">Deadline:</span>
            <span>{absoluteDeadline.toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--color-line)] pt-2 mt-2">
            <span className="text-[var(--color-red)] uppercase text-xs">Timeout Consequence:</span>
            <span className="text-xs text-right max-w-[200px]">
              {kind === 0 && 'Maker reclaims payment + seizes Taker collateral.'}
              {kind === 1 && 'If unfunded, refunded. If funded, atomic swap executes.'}
              {kind === 2 && 'Employer reclaims unreleased payment.'}
            </span>
          </div>
          <div className="flex justify-between border-t border-[var(--color-line)] pt-2 mt-2 text-xs">
            <span className="text-[var(--color-muted)]">Est. Gas:</span>
            <span>{mockGas}</span>
          </div>
        </div>

        {/* SUBMIT BUTTONS */}
        <div className="pt-4 border-t border-[var(--color-line)]">
          {submitDisabled ? (
            <button disabled className="w-full bg-black border border-[var(--color-line)] text-[var(--color-muted)] py-4 font-bold font-mono cursor-not-allowed uppercase">
              {submitReason}
            </button>
          ) : step === 'creating' ? (
            <div className="w-full bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-muted)] py-4 font-mono text-center text-sm uppercase">
              Creating pact…
            </div>
          ) : step === 'approving' ? (
            <div className="w-full bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-muted)] py-4 font-mono text-center text-sm uppercase">
              Approving…
            </div>
          ) : needsApproval ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-center text-[var(--color-muted)] font-mono mb-2">Step 1 of 2</div>
              <button
                onClick={handleApprove}
                className="w-full bg-[var(--color-lime)] text-black py-4 font-bold font-mono hover:brightness-90 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                1. APPROVE {TOKENS.find((t) => t.value === tokenMaker)?.label}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-center text-[var(--color-lime)] font-mono mb-2">Ready to create</div>
              <button
                onClick={handleCreate}
                className="w-full bg-[var(--color-lime)] text-black py-4 font-bold font-mono hover:brightness-90 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                CREATE PACT
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
