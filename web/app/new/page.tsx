'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '../../components/Navbar'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, maxUint256, decodeEventLog } from 'viem'
import { PACT_ABI, ERC20_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC, arcTestnet } from '../../lib/arc'
import { hashTerms } from '../../lib/terms'
import TokenSelect from '../../components/TokenSelect'

const PACT_ADDRESS = process.env.NEXT_PUBLIC_PACT_ADDRESS as `0x${string}`
const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5042002)

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
  const publicClient = usePublicClient()
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
  const [createdPactId, setCreatedPactId] = useState<number | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const { writeContract: writeApprove, data: approveTxHash, isPending: approvePending, error: approveError } = useWriteContract()
  const { writeContract: writeCreate, data: createTxHash, isPending: createPending, error: createError } = useWriteContract()
  
  const { isSuccess: approveConfirmed, isLoading: approveReceiptLoading } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isSuccess: createConfirmed, data: createReceipt, isLoading: createReceiptLoading } = useWaitForTransactionReceipt({ hash: createTxHash })

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
    submitDisabled = true; submitReason = `TERMS TOO SHORT (${terms.length}/20 MIN)`
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

  // Extract created pact ID from receipt
  useEffect(() => {
    if (createConfirmed && createReceipt) {
      setStep('done')
      try {
        for (const log of createReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: PACT_ABI,
              data: log.data,
              topics: log.topics,
            })
            if (decoded.eventName === 'PactCreated') {
              const newId = Number(decoded.args.id)
              setCreatedPactId(newId)
              break
            }
          } catch {
            // Ignore other non-matching event logs
          }
        }
      } catch (err) {
        console.error('Failed to parse PactCreated event:', err)
      }
    }
  }, [createConfirmed, createReceipt])

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

  const handleFillDemo = () => {
    setKind(0)
    setTokenMaker(USDC_ERC20)
    setTokenTaker(USDC_ERC20)
    setAmountMaker('10')
    setAmountTaker('2')
    setTerms('Delivery of 1x Server Hardware unit to Singapore DC. Courier tracking reference required upon fulfillment.')
    setDeadlineMinutes('60')
  }

  const handleMaxMaker = () => {
    if (address && makerBalance > 0n) {
      setAmountMaker(formatUnits(makerBalance, makerDecimals))
    }
  }

  const getTermsPlaceholder = () => {
    if (kind === 0) return 'e.g. Physical delivery of 1x Server Hardware to Singapore DC. Courier tracking reference required upon fulfillment.'
    if (kind === 1) return 'e.g. Atomic currency exchange of USDC for equivalent EURC on settlement confirmation.'
    if (kind === 2) return 'e.g. Full-stack smart contract audit and deployment verification report on GitHub.'
    return 'Define the precise deal terms and fulfillment conditions in plain text…'
  }

  const getMicrocopy = () => {
    if (kind === 0) return { makerRole: 'Buyer / Maker Deposit', takerRole: 'Seller / Taker Bond', makerAction: 'Principal Payment', takerAction: 'Collateral Performance Bond' }
    if (kind === 1) return { makerRole: 'Your Currency Deposit', takerRole: 'Counterparty Deposit', makerAction: 'You Lock', takerAction: 'Counterparty Locks' }
    if (kind === 2) return { makerRole: 'Employer Bounty', takerRole: 'Worker Commitment', makerAction: 'Milestone Bounty', takerAction: 'Optional Commitment Bond' }
    return { makerRole: 'Maker', takerRole: 'Taker', makerAction: 'Lock Amount', takerAction: 'Bond Amount' }
  }

  const mc = getMicrocopy()

  const shareableUrl = createdPactId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${createdPactId}?terms=${encodeURIComponent(terms)}`
    : ''

  const handleCopyShareableLink = () => {
    if (shareableUrl) {
      navigator.clipboard.writeText(shareableUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2500)
    }
  }

  // --- Success Landing State ---
  if (step === 'done' && createConfirmed) {
    return (
      <main className="min-h-screen max-w-[680px] mx-auto pt-8 px-4 sm:px-6 pb-20">
        <Navbar />
        <div className="bg-[#111215] border border-emerald-500/40 rounded-lg p-6 sm:p-8 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 font-mono text-lg font-bold">
            ✓
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Escrow Initialized
          </span>
          <h2 className="text-lg font-semibold text-zinc-100 mt-2 mb-1">
            Pact {createdPactId ? `#${createdPactId.toString().padStart(4, '0')}` : 'Created'} Deployed on Arc Testnet
          </h2>
          <p className="text-xs text-zinc-400 mb-6 max-w-md mx-auto leading-relaxed">
            Your collateral of <strong className="text-zinc-200">{amountMaker} {TOKENS.find(t=>t.value===tokenMaker)?.label}</strong> is locked in the smart contract.
          </p>

          {/* Shareable Link Box */}
          {createdPactId && (
            <div className="bg-[#0c0d10] border border-[#202126] p-4 rounded-md mb-6 text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                  🔗 Shareable Counterparty Link
                </span>
                <span className="text-[10px] font-mono text-emerald-400">Includes Terms Hash</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareableUrl}
                  className="w-full bg-[#141518] border border-[#27282e] text-zinc-300 px-3 py-2 rounded text-xs font-mono select-all"
                />
                <button
                  onClick={handleCopyShareableLink}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black px-3.5 py-2 rounded text-xs font-mono font-bold whitespace-nowrap transition-colors cursor-pointer"
                >
                  {copiedLink ? '✓ Copied' : 'Copy Link'}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                Send this link to your counterparty so they can review the plaintext terms, verify the SHA-256 hash, and deposit their bond.
              </p>
            </div>
          )}

          {/* Action Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {createdPactId ? (
              <Link
                href={`/p/${createdPactId}?terms=${encodeURIComponent(terms)}`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-2.5 text-xs font-mono font-bold rounded-md transition-all shadow-sm"
              >
                Inspect Pact #{createdPactId} Details →
              </Link>
            ) : (
              <Link
                href="/"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-2.5 text-xs font-mono font-bold rounded-md transition-all shadow-sm"
              >
                Go to Tape Dashboard →
              </Link>
            )}

            {createTxHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${createTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-[#17181c] hover:bg-[#202127] text-zinc-300 border border-[#27282e] px-4 py-2.5 text-xs font-mono font-medium rounded-md transition-colors"
              >
                View on ArcScan ↗
              </a>
            )}
          </div>
        </div>
      </main>
    )
  }

  // --- Disconnected State ---
  if (!isConnected) {
    return (
      <main className="min-h-screen max-w-[680px] mx-auto pt-8 px-4 sm:px-6 pb-20">
        <Navbar />
        <div className="bg-[#111215] border border-[#1e1f25] rounded-lg p-8 text-center max-w-md mx-auto shadow-sm">
          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mx-auto mb-3 font-mono font-bold text-xs">
            🔒
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1.5">Connect Wallet to Deploy Pact</h2>
          <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
            Pact requires a Web3 wallet connected to Circle Arc Testnet (5042002) to lock escrow collateral.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-zinc-500 hover:text-zinc-300 hover:underline"
            >
              ← Back to Ledger Dashboard
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-[680px] mx-auto pt-8 px-4 sm:px-6 pb-24">
      <Navbar />

      {/* Wrong Network Banner */}
      {isWrongChain && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-md p-3.5 mb-6 text-xs font-mono flex items-center justify-between text-rose-300">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            Wrong Network. Please switch to Circle Arc Testnet.
          </span>
          <button
            onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            className="bg-rose-500 text-black px-3 py-1 rounded text-xs font-bold hover:bg-rose-400 transition-colors"
          >
            Switch Network
          </button>
        </div>
      )}

      {/* 3-Minute Fast Fill Demo Helper */}
      <div className="bg-[#141518] border border-[#24262d] rounded-md p-3.5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="text-emerald-400 text-sm">⚡</span>
          <div>
            <span className="text-xs font-medium text-zinc-200 block">Reviewer Fast Path</span>
            <span className="text-[11px] text-zinc-400 block">Pre-fill sample Delivery escrow parameters in 1-click.</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleFillDemo}
          className="inline-flex items-center justify-center gap-1 bg-[#1e2026] hover:bg-[#282a32] text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer"
        >
          Auto-Fill Delivery Demo
        </button>
      </div>

      {/* Zero Balance Helper & Circle Faucet Link */}
      {address && makerBalance === 0n && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3.5 mb-6 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-amber-300">
          <span className="flex items-center gap-2">
            <span>🚰</span>
            <span>Your USDC balance on Arc Testnet is 0.</span>
          </span>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noreferrer"
            className="bg-amber-400 hover:bg-amber-300 text-black px-3 py-1 rounded text-xs font-bold tracking-wider inline-flex items-center justify-center gap-1 transition-colors"
          >
            Get Free Test USDC ↗
          </a>
        </div>
      )}

      {/* Page Heading */}
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#1c1d22]">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors mb-1.5">
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">Initialize Escrow Contract</h1>
        </div>
        <span className="text-[11px] font-mono text-zinc-500 uppercase">
          Arc Testnet (5042002)
        </span>
      </div>

      <div className="space-y-6">
        {/* Section 1: Protocol Archetype */}
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4">
          <label className="block text-[11px] font-mono text-zinc-400 mb-3 uppercase tracking-wider">
            1. Select Contract Archetype
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

          {/* Taker Deposit */}
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
            <span>SHA-256 on-chain digest:</span>
            {terms && <span className="text-zinc-400">{termsH.slice(0, 14)}...</span>}
          </div>
        </div>

        {/* Section 4: Timeline & Privacy Preferences */}
        <div className="bg-[#111215] border border-[#1e1f25] rounded-md p-4 space-y-4">
          <span className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
            4. Timeline & Privacy Preferences
          </span>

          {/* Expiry Presets */}
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
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-[#0e0f12] hover:bg-[#181a1f] border border-[#222328] hover:border-[#32343c] rounded text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
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
                  Masks the contract dollar value on the public tape. Note: All transactions remain verifiable on-chain.
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

        {/* Transaction Error Alert */}
        {(approveError || createError) && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-md p-3.5 text-xs font-mono text-rose-300">
            <span className="font-bold block mb-1">Transaction Failed:</span>
            <span>{approveError?.message || createError?.message || 'Error executing contract call'}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2">
          {submitDisabled ? (
            <button
              disabled
              className="w-full bg-[#141518] border border-[#202126] text-zinc-500 py-3 rounded-md font-mono text-xs font-bold uppercase tracking-wider cursor-not-allowed"
            >
              {submitReason}
            </button>
          ) : step === 'creating' || createPending || createReceiptLoading ? (
            <div className="w-full bg-[#111215] border border-emerald-500/40 text-emerald-400 py-3 rounded-md font-mono text-xs font-semibold text-center flex flex-col items-center justify-center gap-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>Broadcasting Contract Deployment...</span>
              </div>
              {createTxHash && (
                <a
                  href={`https://testnet.arcscan.app/tx/${createTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-zinc-400 hover:text-emerald-400 underline"
                >
                  View on ArcScan ↗
                </a>
              )}
            </div>
          ) : step === 'approving' || approvePending || approveReceiptLoading ? (
            <div className="w-full bg-[#111215] border border-amber-500/40 text-amber-400 py-3 rounded-md font-mono text-xs font-semibold text-center flex flex-col items-center justify-center gap-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>Approving Token Allowance on Ledger...</span>
              </div>
              {approveTxHash && (
                <a
                  href={`https://testnet.arcscan.app/tx/${approveTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline"
                >
                  View on ArcScan ↗
                </a>
              )}
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
