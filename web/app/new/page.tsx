'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain, useEstimateGas } from 'wagmi'
import { parseUnits, formatUnits, maxUint256 } from 'viem'
import { PACT_ABI, ERC20_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC } from '../../lib/arc'
import { hashTerms } from '../../lib/terms'
import TokenSelect from '../../components/TokenSelect'

const PACT_ADDRESS = process.env.NEXT_PUBLIC_PACT_ADDRESS as `0x${string}`
const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337)

const KINDS = [
  { value: 0, label: 'Delivery', tag: 'DELIVERY', desc: 'Buyer locks payment, seller locks delivery collateral bond.' },
  { value: 1, label: 'FX Swap', tag: 'FX', desc: 'Two-sided atomic currency exchange between counterparties.' },
  { value: 2, label: 'Job Milestone', tag: 'JOB', desc: 'Client locks bounty, released upon satisfactory proof of work.' },
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
    try { return parseUnits(amountTaker || '0', 6) } catch { return 0n }
  }

  const termsH = hashTerms(terms)
  const needsTakerToken = kind === 1 || amountTakerParsed() > 0n
  const effectiveTokenTaker = needsTakerToken ? tokenTaker : '0x0000000000000000000000000000000000000000'
  const absoluteDeadline = new Date(Date.now() + Number(deadlineMinutes || 0) * 60000)
  const deadlineTs = BigInt(Math.floor(absoluteDeadline.getTime() / 1000))

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
    submitDisabled = true; submitReason = `TERMS TOO SHORT (${terms.length}/20 CHARS)`
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
      args: [PACT_ADDRESS, maxUint256],
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
    if (kind === 0) return 'e.g. Physical delivery of 1x Server Rack to Singapore DC. Courier tracking reference required for release.'
    if (kind === 1) return 'e.g. Atomic swap of 5,000 USDC for equivalent EURC on settlement confirmation.'
    if (kind === 2) return 'e.g. Full-stack smart contract audit and deployment verification report on GitHub.'
    return 'Define the precise deal terms and fulfillment conditions in plain text…'
  }

  const getMicrocopy = () => {
    if (kind === 0) return { makerRole: 'Buyer / Maker', takerRole: 'Seller / Taker', makerAction: 'Principal Payment', takerAction: 'Performance Bond' }
    if (kind === 1) return { makerRole: 'Your Deposit', takerRole: 'Counterparty Deposit', makerAction: 'You Lock', takerAction: 'Counterparty Locks' }
    if (kind === 2) return { makerRole: 'Employer', takerRole: 'Worker', makerAction: 'Milestone Bounty', takerAction: 'Optional Commitment Bond' }
    return { makerRole: 'Maker', takerRole: 'Taker', makerAction: 'Lock Amount', takerAction: 'Bond Amount' }
  }

  const mc = getMicrocopy()

  if (createConfirmed) {
    return (
      <main className="min-h-screen max-w-[620px] mx-auto pt-16 px-4 pb-20">
        <div className="bg-[#111215] border border-emerald-500/30 rounded-md p-8 text-center shadow-lg">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 font-mono text-base font-bold">
            ✓
          </div>
          <h2 className="text-base font-semibold text-zinc-100 mb-2">Smart Contract Initialized</h2>
          <p className="text-xs text-zinc-400 mb-6 max-w-md mx-auto leading-relaxed">
            Your pact has been submitted to the Arc ledger. Share the contract link with your counterparty to review and fund.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-[#1c1d22] hover:bg-[#24262d] text-zinc-200 border border-[#2b2c34] px-4 py-2 text-xs font-mono font-medium rounded-md transition-colors"
          >
            ← Return to Dashboard
          </Link>
        </div>
      </main>
    )
  }

  if (!isConnected) {
    return (
      <main className="min-h-screen max-w-[620px] mx-auto pt-20 px-4 pb-20 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-md bg-[#18191d] border border-[#27282e] flex items-center justify-center font-mono font-bold text-sm text-zinc-300 mb-4 shadow-sm">
          P
        </div>
        <h1 className="text-base font-semibold text-zinc-100 mb-2">Initialize New Pact</h1>
        <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
          Please connect your Web3 wallet via the navigation header to deploy a new escrow contract.
        </p>
        <Link
          href="/"
          className="text-xs font-mono text-zinc-500 hover:text-zinc-300 hover:underline"
        >
          ← Return to Dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-[680px] mx-auto pt-8 px-4 sm:px-6 pb-24">
      {/* Network Gate Alert */}
      {isWrongChain && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-md p-3.5 mb-6 text-xs font-mono flex items-center justify-between text-rose-300">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            Wrong Network. Please switch to Arc Testnet.
          </span>
          <button
            onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            className="bg-rose-500 text-black px-3 py-1 rounded text-xs font-bold hover:bg-rose-400 transition-colors"
          >
            Switch Network
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1c1d22]">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors mb-2">
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">Initialize Escrow Pact</h1>
        </div>
        <span className="text-[11px] font-mono text-zinc-500 uppercase">
          Step 1 of 2
        </span>
      </div>

      <div className="space-y-6">
        {/* Section 1: Protocol Kind */}
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4">
          <label className="block text-[11px] font-mono text-zinc-400 mb-3 uppercase tracking-wider">
            1. Contract Archetype
          </label>
          <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`p-3 rounded-md border transition-all cursor-pointer flex flex-col justify-between ${
                  kind === k.value
                    ? 'bg-[#181a1f] border-emerald-500/50 shadow-sm'
                    : 'bg-[#0e0f12] border-[#202127] hover:border-[#2f3139]'
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
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-200">{k.label}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                      kind === k.value ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-500 border-zinc-800'
                    }`}>
                      {k.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{k.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Section 2: Financial Assets & Collateral */}
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4 space-y-4">
          <span className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
            2. Collateral & Settlement Terms
          </span>

          {/* Maker Deposit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TokenSelect
              label={mc.makerRole}
              tokens={TOKENS}
              value={tokenMaker}
              onChange={setTokenMaker}
            />
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">{mc.makerAction}</label>
                {address && (
                  <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                    <span>Bal: {formatUnits(makerBalance, makerDecimals)}</span>
                    <button
                      onClick={handleMaxMaker}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold px-1 rounded hover:bg-emerald-500/10 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                )}
              </div>
              <input
                type="number"
                value={amountMaker}
                onChange={(e) => setAmountMaker(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#0d0e11] border border-[#222328] hover:border-[#32343c] text-zinc-100 px-3 py-2 rounded-md font-mono text-xs placeholder:text-zinc-600 focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Taker Deposit (Conditional) */}
          {(kind === 0 || kind === 1 || kind === 2) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#1c1d22]">
              <TokenSelect
                label={mc.takerRole}
                tokens={TOKENS}
                value={tokenTaker}
                onChange={setTokenTaker}
              />
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                  {mc.takerAction}
                </label>
                <input
                  type="number"
                  value={amountTaker}
                  onChange={(e) => setAmountTaker(e.target.value)}
                  placeholder={kind === 1 ? '0.00' : '0.00 (optional)'}
                  className="w-full bg-[#0d0e11] border border-[#222328] hover:border-[#32343c] text-zinc-100 px-3 py-2 rounded-md font-mono text-xs placeholder:text-zinc-600 focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Counterparty Address */}
          <div className="pt-3 border-t border-[#1c1d22]">
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
              Specific Counterparty Address <span className="text-zinc-500 normal-case">(leave blank for open public taker)</span>
            </label>
            <input
              type="text"
              value={taker}
              onChange={(e) => setTaker(e.target.value)}
              placeholder="0x0000000000000000000000000000000000000000"
              className="w-full bg-[#0d0e11] border border-[#222328] hover:border-[#32343c] text-zinc-100 px-3 py-2 rounded-md font-mono text-xs placeholder:text-zinc-700 focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        {/* Section 3: Fulfillment Agreement (Terms) */}
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              3. Contract Terms & Fulfillment Criteria
            </label>
            <span className={`text-[11px] font-mono ${terms.length < 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {terms.length}/20 min chars
            </span>
          </div>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={getTermsPlaceholder()}
            rows={4}
            className="w-full bg-[#0d0e11] border border-[#222328] hover:border-[#32343c] text-zinc-100 px-3 py-2.5 rounded-md font-sans text-xs leading-relaxed placeholder:text-zinc-600 focus:border-emerald-500 resize-none transition-colors"
          />
          <div className="mt-2 text-[11px] font-mono text-zinc-500 flex items-center justify-between">
            <span>On-chain hash digest will be computed via SHA-256</span>
            {terms && <span className="text-zinc-400">SHA: {termsH.slice(0, 10)}...</span>}
          </div>
        </div>

        {/* Section 4: Settlement Expiry & Privacy */}
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4 space-y-4">
          <span className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
            4. Timeline & Privacy Preferences
          </span>

          {/* Expiration Input + Presets */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
              Expiration Window
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
              <div className="relative w-full sm:w-1/2">
                <input
                  type="number"
                  value={deadlineMinutes}
                  onChange={(e) => setDeadlineMinutes(e.target.value)}
                  min="2"
                  className="w-full bg-[#0d0e11] border border-[#222328] hover:border-[#32343c] text-zinc-100 px-3 py-2 rounded-md font-mono text-xs focus:border-emerald-500 transition-colors"
                />
                <span className="absolute right-3 top-2 text-xs font-mono text-zinc-500">mins</span>
              </div>
              <div className="flex gap-1.5 w-full sm:w-auto">
                {[
                  { mins: 60, label: '1H' },
                  { mins: 360, label: '6H' },
                  { mins: 1440, label: '24H' },
                  { mins: 10080, label: '7D' },
                ].map(preset => (
                  <button
                    key={preset.mins}
                    type="button"
                    onClick={() => setDeadlineMinutes(preset.mins.toString())}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-[#0e0f12] hover:bg-[#181a1f] border border-[#222328] hover:border-[#32343c] rounded text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] font-mono text-zinc-500 mt-2">
              Absolute Expiry: <span className="text-zinc-300">{absoluteDeadline.toLocaleString()}</span>
            </p>
          </div>

          {/* Privacy Toggle */}
          <div className="pt-3 border-t border-[#1c1d22]">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={blurSize}
                onChange={(e) => setBlurSize(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Obfuscate Amount on Public Dashboard</span>
                <span className="text-[11px] text-zinc-500 block leading-relaxed mt-0.5">
                  Masks the contract dollar value on the web tape. Note: All transactions remain verifiable on-chain.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Section 5: Review & Signing Panel */}
        <div className="bg-[#141518] border border-[#27282e] rounded-md p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-[#222328]">
            <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider">
              Settlement Protocol Preview
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Verified Logic
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Your Deposit:</span>
              <span className="text-zinc-200 font-medium">
                {amountMaker || '0.00'} {TOKENS.find(t => t.value === tokenMaker)?.label}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Counterparty Lock:</span>
              <span className="text-zinc-200 font-medium">
                {amountTaker ? `${amountTaker} ${TOKENS.find(t => t.value === tokenTaker)?.label}` : 'None (Open)'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#202126] text-xs font-mono">
            <span className="text-zinc-500 block text-[10px] uppercase mb-0.5">Expiry Consequence:</span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {kind === 0 && 'If seller fails to deliver before deadline, maker receives full refund and claims seller bond.'}
              {kind === 1 && 'If both parties deposit before deadline, atomic exchange settles. Otherwise all funds refund.'}
              {kind === 2 && 'If proof of work is not accepted or submitted by deadline, client can claim unreleased deposit.'}
            </p>
          </div>
        </div>

        {/* Submit Execution Actions */}
        <div className="pt-2">
          {submitDisabled ? (
            <button
              disabled
              className="w-full bg-[#141518] border border-[#202126] text-zinc-500 py-3 rounded-md font-mono text-xs font-bold uppercase tracking-wider cursor-not-allowed"
            >
              {submitReason}
            </button>
          ) : step === 'creating' ? (
            <div className="w-full bg-[#111215] border border-emerald-500/40 text-emerald-400 py-3 rounded-md font-mono text-xs font-semibold text-center flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              Broadcasting Contract Deployment...
            </div>
          ) : step === 'approving' ? (
            <div className="w-full bg-[#111215] border border-amber-500/40 text-amber-400 py-3 rounded-md font-mono text-xs font-semibold text-center flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              Approving Token Allowance on Ledger...
            </div>
          ) : needsApproval ? (
            <div className="space-y-2">
              <div className="text-[11px] text-center text-zinc-400 font-mono">
                Step 1: Authorize ERC-20 token allowance
              </div>
              <button
                onClick={handleApprove}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold tracking-wider transition-all cursor-pointer shadow-sm"
              >
                1. APPROVE {TOKENS.find((t) => t.value === tokenMaker)?.label}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleCreate}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold tracking-wider transition-all cursor-pointer shadow-sm"
              >
                DEPLOY & LOCK COLLATERAL
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
