'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '../../components/Navbar'
import TrustStrip from '../../components/TrustStrip'
import ConnectButton from '../../components/ConnectButton'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from 'wagmi'
import { parseUnits, formatUnits, maxUint256, decodeEventLog } from 'viem'
import { PACT_ABI, ERC20_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC } from '../../lib/arc'
import { hashTerms } from '../../lib/terms'
import TokenSelect from '../../components/TokenSelect'

const PACT_ADDRESS = (process.env.NEXT_PUBLIC_PACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5042002)

const KINDS = [
  { value: 0, label: 'Delivery', desc: 'Buyer locks payment, seller locks collateral.' },
  { value: 1, label: 'FX Swap', desc: 'Two-sided atomic currency exchange.' },
  { value: 2, label: 'Job', desc: 'Client locks bounty for proof of work.' },
]

const TOKENS = [
  { value: USDC_ERC20, label: 'USDC' },
  { value: EURC, label: 'EURC' },
]

export default function NewPactPage() {
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

  useEffect(() => { document.title = 'PACT · New' }, [])

  const { writeContract: writeApprove, data: approveTxHash, isPending: approvePending, error: approveError } = useWriteContract()
  const { writeContract: writeCreate, data: createTxHash, isPending: createPending, error: createError } = useWriteContract()
  const { isSuccess: approveConfirmed, isLoading: approveReceiptLoading } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isSuccess: createConfirmed, data: createReceipt, isLoading: createReceiptLoading } = useWaitForTransactionReceipt({ hash: createTxHash })

  const { data: makerBalData } = useReadContract({
    address: tokenMaker as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined, query: { enabled: !!address },
  })
  const { data: makerDecimalsData } = useReadContract({
    address: tokenMaker as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals',
  })
  const makerDecimals = Number(makerDecimalsData ?? 6)
  const makerBalance = (makerBalData as bigint) ?? 0n

  const { data: allowanceData } = useReadContract({
    address: tokenMaker as `0x${string}`, abi: ERC20_ABI, functionName: 'allowance',
    args: address ? [address, PACT_ADDRESS] : undefined, query: { enabled: !!address }
  })
  const currentAllowance = (allowanceData as bigint) || 0n

  const amountMakerParsed = () => { try { return parseUnits(amountMaker || '0', makerDecimals) } catch { return 0n } }
  const amountTakerParsed = () => { try { return parseUnits(amountTaker || '0', 6) } catch { return 0n } }

  const termsH = hashTerms(terms)
  const needsTakerToken = kind === 1 || amountTakerParsed() > 0n
  const effectiveTokenTaker = needsTakerToken ? tokenTaker : '0x0000000000000000000000000000000000000000'
  const absoluteDeadline = new Date(Date.now() + Number(deadlineMinutes || 0) * 60000)
  const deadlineTs = BigInt(Math.floor(absoluteDeadline.getTime() / 1000))

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const makerAmountBn = amountMakerParsed()
  const hasEnoughBalance = address ? makerAmountBn <= makerBalance : false
  const needsApproval = makerAmountBn > currentAllowance
  const selectedTokenLabel = TOKENS.find(t => t.value === tokenMaker)?.label || 'tokens'

  let submitDisabled = false
  let submitReason = ''
  if (!amountMaker || makerAmountBn === 0n) { submitDisabled = true; submitReason = 'Enter an amount' }
  else if (!hasEnoughBalance) { submitDisabled = true; submitReason = `Not enough ${selectedTokenLabel}` }
  else if (terms.length < 20) { submitDisabled = true; submitReason = `Terms need ${20 - terms.length} more characters` }
  else if (!deadlineMinutes || Number(deadlineMinutes) < 2) { submitDisabled = true; submitReason = 'Minimum 2 minutes deadline' }
  else if (kind === 1 && (!amountTaker || amountTakerParsed() === 0n)) { submitDisabled = true; submitReason = 'Enter counterparty amount' }

  useEffect(() => { if (approveConfirmed && step === 'approving') setStep('form') }, [approveConfirmed, step])

  useEffect(() => {
    if (createConfirmed && createReceipt) {
      setStep('done')
      try {
        for (const log of createReceipt.logs) {
          try {
            const decoded = decodeEventLog({ abi: PACT_ABI, data: log.data, topics: log.topics })
            if (decoded.eventName === 'PactCreated') { setCreatedPactId(Number(decoded.args.id)); break }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  }, [createConfirmed, createReceipt])

  const handleApprove = () => {
    if (!isConnected || isWrongChain) return
    setStep('approving')
    writeApprove({ address: tokenMaker as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [PACT_ADDRESS, maxUint256] })
  }

  const handleCreate = () => {
    if (!isConnected || isWrongChain) return
    setStep('creating')
    writeCreate({
      address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'createPact',
      args: [kind, (taker || '0x0000000000000000000000000000000000000000') as `0x${string}`, tokenMaker as `0x${string}`,
        effectiveTokenTaker as `0x${string}`, makerAmountBn, kind === 1 ? amountTakerParsed() : (amountTaker ? amountTakerParsed() : 0n),
        deadlineTs, termsH, blurSize],
    })
  }

  const handleFillDemo = () => {
    setKind(0); setTokenMaker(USDC_ERC20); setTokenTaker(USDC_ERC20)
    setAmountMaker('10'); setAmountTaker('2')
    setTerms('Delivery of 1x Server Hardware unit to Singapore DC. Courier tracking reference required upon fulfillment.')
    setDeadlineMinutes('60')
  }

  const handleMaxMaker = () => {
    if (address && makerBalance > 0n) setAmountMaker(formatUnits(makerBalance, makerDecimals))
  }

  const shareableUrl = createdPactId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${createdPactId}?terms=${encodeURIComponent(terms)}`
    : ''

  const handleCopyLink = () => {
    if (shareableUrl) { navigator.clipboard.writeText(shareableUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500) }
  }

  const mc = kind === 0
    ? { maker: 'Your deposit', taker: 'Seller bond', makerAct: 'Payment', takerAct: 'Collateral' }
    : kind === 1
    ? { maker: 'You lock', taker: 'They lock', makerAct: 'Your side', takerAct: 'Their side' }
    : { maker: 'Bounty', taker: 'Worker bond', makerAct: 'Bounty', takerAct: 'Bond (optional)' }

  // ── Success state ──
  if (step === 'done' && createConfirmed) {
    return (
      <main className="min-h-screen max-w-[640px] mx-auto pt-6 sm:pt-8 px-4 sm:px-6 pb-20 overflow-x-hidden">
        <Navbar />
        <TrustStrip />
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8 text-center animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto mb-4 font-mono text-lg font-bold">
            ✓
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">
            Pact {createdPactId ? `#${createdPactId.toString().padStart(4, '0')}` : ''} created
          </h2>
          <p className="text-sm text-zinc-400 mb-6">
            {amountMaker} {selectedTokenLabel} locked on Arc Testnet.
          </p>

          {createdPactId && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-md p-3 mb-6 text-left">
              <span className="text-[11px] font-mono text-zinc-500 uppercase block mb-2">Share with counterparty</span>
              <div className="flex items-center gap-2">
                <input readOnly value={shareableUrl} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-2 rounded text-xs font-mono select-all" />
                <button onClick={handleCopyLink} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded text-xs font-mono font-bold whitespace-nowrap transition-colors cursor-pointer">
                  {copiedLink ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {createdPactId ? (
              <Link href={`/p/${createdPactId}?terms=${encodeURIComponent(terms)}`}
                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-2.5 text-xs font-mono font-bold rounded-md transition-colors inline-flex items-center justify-center">
                Open Pact →
              </Link>
            ) : (
              <Link href="/" className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-2.5 text-xs font-mono font-bold rounded-md transition-colors inline-flex items-center justify-center">
                Dashboard →
              </Link>
            )}
            {createTxHash && (
              <a href={`https://testnet.arcscan.app/tx/${createTxHash}`} target="_blank" rel="noreferrer"
                className="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2.5 text-xs font-mono rounded-md transition-colors inline-flex items-center justify-center">
                ArcScan ↗
              </a>
            )}
          </div>
        </div>
      </main>
    )
  }

  // ── Disconnected state ──
  if (!isConnected) {
    return (
      <main className="min-h-screen max-w-[640px] mx-auto pt-6 sm:pt-8 px-4 sm:px-6 pb-20 overflow-x-hidden">
        <Navbar />
        <TrustStrip />
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center max-w-sm mx-auto">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 mx-auto mb-4 text-sm">
            🔒
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">Connect to create a pact</h2>
          <p className="text-xs text-zinc-500 mb-5">You'll need a wallet on Arc Testnet.</p>
          <ConnectButton />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-[640px] mx-auto pt-6 sm:pt-8 px-4 sm:px-6 pb-24 overflow-x-hidden">
      <Navbar />
      <TrustStrip />

      {/* Wrong chain */}
      {isWrongChain && (
        <div className="rounded-md bg-rose-500/8 border border-rose-500/25 p-3 mb-5 text-xs font-mono flex items-center justify-between gap-3 text-rose-300">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Wrong network. Switch to Arc Testnet.
          </span>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            className="bg-rose-500 text-black px-3 py-1 rounded text-xs font-bold hover:bg-rose-400 transition-colors shrink-0 cursor-pointer">
            Switch
          </button>
        </div>
      )}

      {/* Zero balance */}
      {address && makerBalance === 0n && (
        <div className="rounded-md bg-amber-500/8 border border-amber-500/25 p-3 mb-5 text-xs font-mono flex items-center justify-between gap-3 text-amber-300">
          <span>No {selectedTokenLabel} balance</span>
          <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer"
            className="bg-amber-400 text-black px-3 py-1 rounded text-xs font-bold hover:bg-amber-300 transition-colors shrink-0">
            Get test tokens ↗
          </a>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back
          </Link>
          <h1 className="text-base font-semibold text-zinc-100 mt-1">New Pact</h1>
        </div>
        <button type="button" onClick={handleFillDemo}
          className="text-[11px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer">
          Fill demo ↓
        </button>
      </div>

      <div className="space-y-5">
        {/* Kind selector */}
        <fieldset>
          <legend className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">Type</legend>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map(k => (
              <label key={k.value} className={`p-3 rounded-md border cursor-pointer transition-all text-center ${
                kind === k.value ? 'bg-zinc-800/60 border-emerald-500/40' : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700'
              }`}>
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                <span className={`text-xs font-medium block ${kind === k.value ? 'text-zinc-100' : 'text-zinc-400'}`}>{k.label}</span>
                <span className="text-[10px] text-zinc-600 mt-1 block leading-tight">{k.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Amounts */}
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 space-y-4">
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block">Collateral</span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TokenSelect label={mc.maker} tokens={TOKENS} value={tokenMaker} onChange={setTokenMaker} />
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">{mc.makerAct}</label>
                {address && (
                  <span className="text-[11px] font-mono text-zinc-500">
                    {formatUnits(makerBalance, makerDecimals)}{' '}
                    <button onClick={handleMaxMaker} className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer">max</button>
                  </span>
                )}
              </div>
              <input type="number" value={amountMaker} onChange={e => setAmountMaker(e.target.value)} placeholder="0.00"
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-100 px-3 py-2 rounded-md font-mono text-xs placeholder:text-zinc-700 focus:border-emerald-500 transition-colors" />
            </div>
          </div>

          {/* Taker side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-zinc-800/50">
            <TokenSelect label={mc.taker} tokens={TOKENS} value={tokenTaker} onChange={setTokenTaker} />
            <div>
              <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">{mc.takerAct}</label>
              <input type="number" value={amountTaker} onChange={e => setAmountTaker(e.target.value)}
                placeholder={kind === 1 ? '0.00' : '0.00 (optional)'}
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-100 px-3 py-2 rounded-md font-mono text-xs placeholder:text-zinc-700 focus:border-emerald-500 transition-colors" />
            </div>
          </div>

          {/* Counterparty */}
          <div className="pt-3 border-t border-zinc-800/50">
            <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">
              Counterparty <span className="normal-case text-zinc-600">(blank = open)</span>
            </label>
            <input type="text" value={taker} onChange={e => setTaker(e.target.value)} placeholder="0x..."
              className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-100 px-3 py-2 rounded-md font-mono text-xs placeholder:text-zinc-700 focus:border-emerald-500 transition-colors" />
          </div>
        </div>

        {/* Terms */}
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Terms</label>
            <span className={`text-[11px] font-mono ${terms.length < 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {terms.length}/20
            </span>
          </div>
          <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3}
            placeholder="Describe the deal terms and fulfillment criteria…"
            className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-100 px-3 py-2.5 rounded-md font-sans text-xs leading-relaxed placeholder:text-zinc-700 focus:border-emerald-500 resize-none transition-colors" />
          {terms && (
            <div className="mt-1.5 text-[10px] font-mono text-zinc-600">
              SHA-256: {termsH.slice(0, 14)}…
            </div>
          )}
        </div>

        {/* Deadline */}
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4">
          <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block mb-2">Deadline</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input type="number" value={deadlineMinutes} onChange={e => setDeadlineMinutes(e.target.value)} min="2"
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-100 px-3 py-2 rounded-md font-mono text-xs focus:border-emerald-500 transition-colors" />
              <span className="absolute right-3 top-2 text-[11px] font-mono text-zinc-600">min</span>
            </div>
            {[{ m: 60, l: '1h' }, { m: 360, l: '6h' }, { m: 1440, l: '24h' }, { m: 10080, l: '7d' }].map(p => (
              <button key={p.m} type="button" onClick={() => setDeadlineMinutes(p.m.toString())}
                className="px-2.5 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                {p.l}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-mono text-zinc-600 mt-1.5">
            Expires {absoluteDeadline.toLocaleString()}
          </p>

          {/* Blur toggle */}
          <label className="flex items-center gap-2.5 mt-3 pt-3 border-t border-zinc-800/50 cursor-pointer">
            <input type="checkbox" checked={blurSize} onChange={e => setBlurSize(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500" />
            <div>
              <span className="text-xs text-zinc-300 block">Hide amounts on dashboard</span>
              <span className="text-[10px] text-zinc-600 block">On-chain records remain public.</span>
            </div>
          </label>
        </div>

        {/* Pre-deploy summary */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/20 p-4 text-xs font-mono">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px] block mb-2">Before you deploy</span>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            <div><span className="text-zinc-500">Lock:</span> <span className="text-zinc-200">{amountMaker || '—'} {selectedTokenLabel}</span></div>
            <div><span className="text-zinc-500">Counterparty:</span> <span className="text-zinc-200">{taker ? `${taker.slice(0,6)}…${taker.slice(-4)}` : 'Open'}</span></div>
            <div><span className="text-zinc-500">Expires:</span> <span className="text-zinc-200">{absoluteDeadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div><span className="text-zinc-500">Signatures:</span> <span className="text-zinc-200">{needsApproval ? '2 (approve + deploy)' : '1'}</span></div>
          </div>
        </div>

        {/* Errors */}
        {(approveError || createError) && (
          <div className="rounded-md bg-rose-500/8 border border-rose-500/25 p-3 text-xs font-mono text-rose-300">
            {approveError?.message || createError?.message || 'Transaction failed'}
          </div>
        )}

        {/* Submit */}
        <div className="pt-1">
          {submitDisabled ? (
            <button disabled className="w-full bg-zinc-800 border border-zinc-700 text-zinc-500 py-3 rounded-md font-mono text-xs cursor-not-allowed">
              {submitReason}
            </button>
          ) : step === 'creating' || createPending || createReceiptLoading ? (
            <div className="w-full border border-emerald-500/30 text-emerald-400 py-3 rounded-md font-mono text-xs text-center flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              Confirm in wallet…
              {createTxHash && <a href={`https://testnet.arcscan.app/tx/${createTxHash}`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-emerald-400 underline ml-2">tx ↗</a>}
            </div>
          ) : step === 'approving' || approvePending || approveReceiptLoading ? (
            <div className="w-full border border-amber-500/30 text-amber-400 py-3 rounded-md font-mono text-xs text-center flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              Approve {selectedTokenLabel} in wallet…
            </div>
          ) : needsApproval ? (
            <div className="space-y-2">
              <p className="text-[11px] text-zinc-500 font-mono text-center">Step 1 of 2 — approve {selectedTokenLabel}</p>
              <button onClick={handleApprove}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold transition-colors cursor-pointer">
                Approve {selectedTokenLabel}
              </button>
            </div>
          ) : (
            <button onClick={handleCreate}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-md font-mono text-xs font-bold transition-colors cursor-pointer">
              Deploy & Lock
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
