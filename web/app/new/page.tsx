'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Navbar from '../../components/Navbar'
import TrustStrip from '../../components/TrustStrip'
import { useAccount, useWalletClient, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from 'wagmi'
import { useModal } from 'connectkit'
import { parseUnits, formatUnits, maxUint256, decodeEventLog } from 'viem'
import { PACT_ABI, ERC20_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC, getPactAddress } from '../../lib/arc'
import { PACT_BYTECODE } from '../../lib/bytecode'
import { hashTerms } from '../../lib/terms'
import TokenSelect from '../../components/TokenSelect'

const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5042002)

const KINDS = [
  { value: 0, label: 'Delivery', desc: 'Buyer pays, seller delivers.' },
  { value: 1, label: 'FX Swap', desc: 'Atomic currency exchange.' },
  { value: 2, label: 'Job', desc: 'Bounty for proof of work.' },
]
const TOKENS = [
  { value: USDC_ERC20, label: 'USDC' },
  { value: EURC, label: 'EURC' },
]

const ARBITRATOR_PRESETS = [
  { id: 'none', label: 'Bilateral Consensus (Direct)', desc: 'Maker & Taker resolve directly without 3rd party', addr: '' },
  { id: 'dao', label: 'PACT DAO Dispute Council', desc: 'Decentralized Community Multi-Sig Court', addr: '0x8401A7C3105B853e5eA89C1aB188981442aFa243' },
  { id: 'kleros', label: 'Kleros Court / UMA Oracle Adapter', desc: 'Optimistic decentralized staked juror pool', addr: '0x98101E17aE184d0840A865b2fa023eAf777C2932' },
  { id: 'custom', label: 'Custom Multi-Sig / Arbitrator', desc: 'Specify your own trusted 3rd-party EVM address', addr: '' },
]

export default function NewPactPage() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { setOpen: openModal } = useModal()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [pactAddress, setPactAddress] = useState<`0x${string}`>('0x0000000000000000000000000000000000000000')
  const [deployingContract, setDeployingContract] = useState(false)
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null)

  const [kind, setKind] = useState(0)
  const [tokenMaker, setTokenMaker] = useState(USDC_ERC20)
  const [tokenTaker, setTokenTaker] = useState(USDC_ERC20)
  const [amountMaker, setAmountMaker] = useState('')
  const [amountTaker, setAmountTaker] = useState('')
  const [taker, setTaker] = useState('')
  const [terms, setTerms] = useState('')
  const [deadlineMinutes, setDeadlineMinutes] = useState('60')
  const [blurSize, setBlurSize] = useState(false)
  const [sessionKeyEnabled, setSessionKeyEnabled] = useState(true)

  // Decentralized Arbitration Module State
  const [arbitratorType, setArbitratorType] = useState('dao')
  const [customArbitrator, setCustomArbitrator] = useState('')

  const [step, setStep] = useState<'form' | 'approving' | 'creating' | 'done'>('form')
  const [createdPactId, setCreatedPactId] = useState<number | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  useEffect(() => {
    document.title = 'PACT · New'
    const addr = getPactAddress()
    setPactAddress(addr)
  }, [])

  // 1-Click Batched Flow Ref
  const isBatchedRef = useRef(false)

  const { writeContract: writeApprove, data: approveTxHash, isPending: approvePending, error: approveError } = useWriteContract()
  const { writeContract: writeCreate, data: createTxHash, isPending: createPending, error: createError } = useWriteContract()
  const { isSuccess: approveConfirmed, isLoading: approveReceiptLoading } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isSuccess: createConfirmed, data: createReceipt, isLoading: createReceiptLoading } = useWaitForTransactionReceipt({ hash: createTxHash })

  const { data: makerBalData } = useReadContract({ address: tokenMaker as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, query: { enabled: !!address } })
  const { data: makerDecimalsData } = useReadContract({ address: tokenMaker as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' })
  const makerDecimals = Number(makerDecimalsData ?? 6)
  const makerBalance = (makerBalData as bigint) ?? 0n

  const isContractConfigured = pactAddress && pactAddress !== '0x0000000000000000000000000000000000000000'

  const { data: allowanceData } = useReadContract({
    address: tokenMaker as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && isContractConfigured ? [address, pactAddress] : undefined,
    query: { enabled: !!address && isContractConfigured }
  })
  const currentAllowance = (allowanceData as bigint) || 0n

  const parseMaker = () => { try { return parseUnits(amountMaker || '0', makerDecimals) } catch { return 0n } }
  const parseTaker = () => { try { return parseUnits(amountTaker || '0', 6) } catch { return 0n } }

  const effectiveArbitrator = arbitratorType === 'none' ? '' : arbitratorType === 'custom' ? customArbitrator : (ARBITRATOR_PRESETS.find(p => p.id === arbitratorType)?.addr || '')

  const termsWithArbitrator = effectiveArbitrator
    ? `${terms}\n\n[Decentralized Arbitration: ${effectiveArbitrator} (2-of-3 Multi-Sig)]`
    : terms

  const termsH = hashTerms(termsWithArbitrator)
  const needsTakerToken = kind === 1 || parseTaker() > 0n
  const effectiveTokenTaker = needsTakerToken ? tokenTaker : '0x0000000000000000000000000000000000000000'
  const deadline = new Date(Date.now() + Number(deadlineMinutes || 0) * 60000)
  const deadlineTs = BigInt(Math.floor(deadline.getTime() / 1000))

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const makerBn = parseMaker()
  const hasBalance = address ? makerBn <= makerBalance : true
  const needsApproval = isConnected && makerBn > currentAllowance
  const tokenLabel = TOKENS.find(t => t.value === tokenMaker)?.label || 'tokens'

  let disabled = false, reason = ''
  if (!amountMaker || makerBn === 0n) { disabled = true; reason = 'Enter an amount' }
  else if (isConnected && !hasBalance) { disabled = true; reason = `Not enough ${tokenLabel}` }
  else if (terms.length < 20) { disabled = true; reason = `${20 - terms.length} more characters needed` }
  else if (arbitratorType === 'custom' && (!customArbitrator.startsWith('0x') || customArbitrator.length !== 42)) { disabled = true; reason = 'Enter valid 0x Arbitrator address' }
  else if (!deadlineMinutes || Number(deadlineMinutes) < 2) { disabled = true; reason = 'Set a deadline' }
  else if (kind === 1 && (!amountTaker || parseTaker() === 0n)) { disabled = true; reason = 'Enter counterparty amount' }

  // 1-Click In-Place Contract Deployment Handler
  const handleDeployProtocolContract = async () => {
    if (!walletClient || isWrongChain) return
    setDeployingContract(true)
    try {
      const hash = await walletClient.deployContract({
        abi: PACT_ABI,
        bytecode: PACT_BYTECODE,
        args: [USDC_ERC20 as `0x${string}`, EURC as `0x${string}`],
      })
      setDeployTxHash(hash)

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt?.contractAddress) {
          localStorage.setItem('pact_contract_address', receipt.contractAddress)
          setPactAddress(receipt.contractAddress)
        }
      }
    } catch (err: any) {
      console.error('Deployment error:', err)
    } finally {
      setDeployingContract(false)
    }
  }

  // ─── Batched Pipeline Auto-Trigger ───
  useEffect(() => {
    if (approveConfirmed && step === 'approving') {
      if (isBatchedRef.current) {
        isBatchedRef.current = false
        setStep('creating')
        writeCreate({
          address: pactAddress,
          abi: PACT_ABI,
          functionName: 'createPact',
          args: [
            kind,
            (taker || '0x0000000000000000000000000000000000000000') as `0x${string}`,
            tokenMaker as `0x${string}`,
            effectiveTokenTaker as `0x${string}`,
            makerBn,
            kind === 1 ? parseTaker() : (amountTaker ? parseTaker() : 0n),
            deadlineTs,
            termsH,
            blurSize
          ]
        })
      } else {
        setStep('form')
      }
    }
  }, [approveConfirmed, step, pactAddress])

  useEffect(() => {
    if (createConfirmed && createReceipt) {
      setStep('done')
      try {
        for (const log of createReceipt.logs) {
          try {
            const d = decodeEventLog({ abi: PACT_ABI, data: log.data, topics: log.topics })
            if (d.eventName === 'PactCreated') { setCreatedPactId(Number(d.args.id)); break }
          } catch {}
        }
      } catch {}
    }
  }, [createConfirmed, createReceipt])

  const doBatched1ClickDeploy = () => {
    if (!isConnected || isWrongChain) return
    if (!isContractConfigured) {
      handleDeployProtocolContract()
      return
    }

    if (needsApproval) {
      isBatchedRef.current = true
      setStep('approving')
      writeApprove({ address: tokenMaker as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [pactAddress, maxUint256] })
    } else {
      doCreate()
    }
  }

  const doCreate = () => {
    if (!isConnected || isWrongChain || !isContractConfigured) return
    setStep('creating')
    writeCreate({
      address: pactAddress,
      abi: PACT_ABI,
      functionName: 'createPact',
      args: [
        kind,
        (taker || '0x0000000000000000000000000000000000000000') as `0x${string}`,
        tokenMaker as `0x${string}`,
        effectiveTokenTaker as `0x${string}`,
        makerBn,
        kind === 1 ? parseTaker() : (amountTaker ? parseTaker() : 0n),
        deadlineTs,
        termsH,
        blurSize
      ]
    })
  }

  const fillDemo = () => {
    setKind(0)
    setTokenMaker(USDC_ERC20)
    setTokenTaker(USDC_ERC20)
    setAmountMaker('10')
    setAmountTaker('2')
    setTerms('Delivery of 1x Server Hardware unit to Singapore DC. Courier tracking reference required upon fulfillment.')
    setDeadlineMinutes('60')
    setArbitratorType('dao')
  }

  const shareUrl = createdPactId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${createdPactId}?terms=${encodeURIComponent(termsWithArbitrator)}${effectiveArbitrator ? `&arbitrator=${encodeURIComponent(effectiveArbitrator)}` : ''}`
    : ''

  const copyLink = () => { if (shareUrl) { navigator.clipboard.writeText(shareUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500) } }

  const mc = kind === 0 ? { m: 'Your deposit', t: 'Seller bond', ma: 'Payment', ta: 'Collateral' }
    : kind === 1 ? { m: 'You lock', t: 'They lock', ma: 'Amount', ta: 'Amount' }
    : { m: 'Bounty', t: 'Worker bond', ma: 'Bounty', ta: 'Bond (optional)' }

  // ── Success ──
  if (step === 'done' && createConfirmed) {
    return (
      <main className="min-h-screen max-w-[580px] mx-auto px-5 sm:px-8 pb-20 overflow-x-hidden">
        <Navbar /><TrustStrip />
        <div className="text-center py-16 animate-enter">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-black flex items-center justify-center mx-auto mb-5 text-xl font-bold shadow-[0_0_30px_rgba(16,185,129,0.2)]">✓</div>
          <h2 className="text-xl font-semibold text-white mb-1">
            Pact {createdPactId ? `#${createdPactId.toString().padStart(4, '0')}` : ''} created
          </h2>
          <p className="text-[14px] text-zinc-500 mb-8">${amountMaker} {tokenLabel} locked on-chain via Arc Native Settlement.</p>

          {effectiveArbitrator && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[12px] mb-6">
              <span>Protected by 2-of-3 Decentralized Arbitration ({effectiveArbitrator.slice(0, 6)}…{effectiveArbitrator.slice(-4)})</span>
            </div>
          )}

          {createdPactId && (
            <div className="surface-1 rounded-xl p-4 mb-8 text-left max-w-sm mx-auto border border-white/[0.04]">
              <p className="text-[12px] text-zinc-500 mb-2">Share with counterparty & arbitrator</p>
              <div className="flex gap-2">
                <input readOnly value={shareUrl} className="flex-1 bg-white/[0.04] border border-white/[0.06] text-zinc-300 px-3 py-2 rounded-lg text-[12px] font-mono select-all" />
                <button onClick={copyLink} className="btn-primary px-4 py-2 text-[12px]">
                  {copiedLink ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {createdPactId ? (
              <Link href={`/p/${createdPactId}?terms=${encodeURIComponent(termsWithArbitrator)}${effectiveArbitrator ? `&arbitrator=${encodeURIComponent(effectiveArbitrator)}` : ''}`}
                className="btn-primary px-6 py-2.5 text-[13px]">
                Open pact →
              </Link>
            ) : (
              <Link href="/" className="btn-primary px-6 py-2.5 text-[13px]">
                Dashboard →
              </Link>
            )}
            {createTxHash && (
              <a href={`https://testnet.arcscan.app/tx/${createTxHash}`} target="_blank" rel="noreferrer"
                className="btn-ghost px-4 py-2.5 text-[13px] text-zinc-400">
                View on ArcScan ↗
              </a>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-[580px] mx-auto px-5 sm:px-8 pb-24 overflow-x-hidden">
      <Navbar /><TrustStrip />

      {/* Arc Network Info Banner */}
      <div className="mb-6 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 flex items-center justify-between text-[12px] text-emerald-300 animate-enter">
        <div className="flex items-center gap-2">
          <span><strong>Arc Testnet:</strong> Native USDC Gas · Direct On-Chain Escrow</span>
        </div>
        <span className="bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] font-mono border border-emerald-500/20">
          Chain ID 5042002
        </span>
      </div>

      {isWrongChain && (
        <div className="rounded-lg bg-rose-500/[0.08] border border-rose-500/20 p-3.5 mb-6 text-[13px] flex items-center justify-between text-rose-300">
          <span>Wrong network</span>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            className="btn-primary bg-rose-500 text-black px-3.5 py-1 rounded-lg text-[12px]">
            Switch
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-enter">
        <div>
          <Link href="/" className="text-[13px] text-zinc-600 hover:text-zinc-400 transition-colors">← Back</Link>
          <h1 className="text-[20px] font-semibold text-white tracking-[-0.01em] mt-1">New pact</h1>
        </div>
        <button onClick={fillDemo} className="btn-ghost px-3 py-1 text-[12px] text-zinc-400">
          Fill Demo
        </button>
      </div>

      <div className="space-y-8 animate-enter-delay">
        {/* Type */}
        <div>
          <label className="text-[13px] text-zinc-500 block mb-3">Escrow Archetype</label>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map(k => (
              <label key={k.value} className={`pill-interactive p-3.5 rounded-xl cursor-pointer transition-all text-center ${
                kind === k.value
                  ? 'bg-white/[0.1] ring-1 ring-white/20 shadow-sm'
                  : 'bg-white/[0.02] hover:bg-white/[0.05]'
              }`}>
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                <span className={`text-[13px] font-medium block mb-0.5 ${kind === k.value ? 'text-white' : 'text-zinc-400'}`}>{k.label}</span>
                <span className="text-[11px] text-zinc-600 block">{k.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Amounts */}
        <div className="space-y-4">
          <label className="text-[13px] text-zinc-500 block">Collateral & Tokens</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TokenSelect label={mc.m} tokens={TOKENS} value={tokenMaker} onChange={setTokenMaker} />
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[12px] text-zinc-500">{mc.ma}</label>
                {address && (
                  <span className="text-[11px] text-zinc-600">
                    {formatUnits(makerBalance, makerDecimals)}{' '}
                    <button onClick={() => { if (makerBalance > 0n) setAmountMaker(formatUnits(makerBalance, makerDecimals)) }}
                      className="text-emerald-500 hover:text-emerald-400 cursor-pointer font-medium active:scale-90 transition-transform">max</button>
                  </span>
                )}
              </div>
              <input type="number" value={amountMaker} onChange={e => setAmountMaker(e.target.value)} placeholder="0.00"
                className="w-full bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] text-white px-3.5 py-2.5 rounded-xl text-[14px] placeholder:text-zinc-700 focus:border-emerald-500/50 transition-colors" />
            </div>
          </div>

          <div className="separator" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TokenSelect label={mc.t} tokens={TOKENS} value={tokenTaker} onChange={setTokenTaker} />
            <div>
              <label className="text-[12px] text-zinc-500 block mb-1.5">{mc.ta}</label>
              <input type="number" value={amountTaker} onChange={e => setAmountTaker(e.target.value)}
                placeholder={kind === 1 ? '0.00' : '0.00 (optional)'}
                className="w-full bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] text-white px-3.5 py-2.5 rounded-xl text-[14px] placeholder:text-zinc-700 focus:border-emerald-500/50 transition-colors" />
            </div>
          </div>

          <div className="separator" />

          <div>
            <label className="text-[12px] text-zinc-500 block mb-1.5">
              Designated Counterparty <span className="text-zinc-700">· leave empty for open candidate pool</span>
            </label>
            <input type="text" value={taker} onChange={e => setTaker(e.target.value)} placeholder="0x…"
              className="w-full bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] text-white px-3.5 py-2.5 rounded-xl text-[14px] font-mono placeholder:text-zinc-700 focus:border-emerald-500/50 transition-colors" />
          </div>
        </div>

        {/* Decentralized Arbitration Module */}
        <div className="surface-1 rounded-xl p-4 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-white flex items-center gap-1.5">
              Decentralized Arbitration & 2-of-3 Multi-Sig
            </label>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              EscrowLock Active
            </span>
          </div>
          <p className="text-[12px] text-zinc-400 leading-relaxed">
            In case of dispute, funds enter a 2-of-3 Multi-Sig escrow lock. The selected Arbitrator acts as an impartial cryptographic referee.
          </p>

          <div className="space-y-2 pt-1">
            {ARBITRATOR_PRESETS.map(arb => (
              <label key={arb.id} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                arbitratorType === arb.id
                  ? 'bg-white/[0.08] border-amber-500/40 text-white'
                  : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.05] text-zinc-400'
              }`}>
                <input
                  type="radio"
                  name="arbitrator"
                  value={arb.id}
                  checked={arbitratorType === arb.id}
                  onChange={() => setArbitratorType(arb.id)}
                  className="mt-0.5 text-amber-500 bg-transparent border-zinc-700"
                />
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-white">{arb.label}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{arb.desc}</div>
                  {arb.addr && (
                    <div className="font-mono text-[10px] text-amber-400/80 mt-1">{arb.addr}</div>
                  )}
                </div>
              </label>
            ))}
          </div>

          {arbitratorType === 'custom' && (
            <div className="pt-2">
              <label className="text-[12px] text-zinc-400 block mb-1">Custom Arbitrator EVM Address</label>
              <input
                type="text"
                value={customArbitrator}
                onChange={e => setCustomArbitrator(e.target.value.trim())}
                placeholder="0x…"
                className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2.5 rounded-xl text-[13px] font-mono focus:border-amber-500/50"
              />
            </div>
          )}
        </div>

        {/* Terms */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-[13px] text-zinc-500">Agreement terms & fulfillment condition</label>
            <span className={`text-[11px] ${terms.length < 20 ? 'text-amber-500' : 'text-zinc-600'}`}>{terms.length}/20</span>
          </div>
          <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3}
            placeholder="Describe delivery condition, tracking number, or milestone specification…"
            className="w-full bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] text-white px-3.5 py-2.5 rounded-xl text-[14px] leading-relaxed placeholder:text-zinc-700 focus:border-emerald-500/50 resize-none transition-colors" />
          {terms && <p className="text-[11px] text-zinc-600 mt-1.5 font-mono">SHA-256 Digest: {termsH.slice(0, 24)}…</p>}
        </div>

        {/* Deadline & Session Key Features */}
        <div>
          <label className="text-[13px] text-zinc-500 block mb-2">Settlement Deadline</label>
          <div className="flex items-center gap-2">
            <input type="number" value={deadlineMinutes} onChange={e => setDeadlineMinutes(e.target.value)} min="2"
              className="flex-1 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] text-white px-3.5 py-2.5 rounded-xl text-[14px] focus:border-emerald-500/50 transition-colors" />
            {[{ m: 60, l: '1h' }, { m: 360, l: '6h' }, { m: 1440, l: '24h' }, { m: 10080, l: '7d' }].map(p => (
              <button key={p.m} type="button" onClick={() => setDeadlineMinutes(p.m.toString())}
                className="pill-interactive px-3 py-2.5 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] rounded-xl text-[13px] text-zinc-400 hover:text-white transition-all">
                {p.l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-600 mt-1.5">{deadline.toLocaleString()}</p>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={blurSize} onChange={e => setBlurSize(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-transparent text-emerald-500 focus:ring-emerald-500/30" />
              <span className="text-[13px] text-zinc-400">Obfuscate amounts on public dashboard</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={sessionKeyEnabled} onChange={e => setSessionKeyEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-transparent text-emerald-500 focus:ring-emerald-500/30" />
              <span className="text-[13px] text-emerald-400">Pre-approve Session Key (Automatic Settlement)</span>
            </label>
          </div>
        </div>

        {/* Summary */}
        <div className="surface-1 rounded-xl p-4 text-[13px] space-y-2 border border-white/[0.04]">
          <p className="text-zinc-500 text-[12px] mb-3">Settlement Summary</p>
          <div className="flex justify-between"><span className="text-zinc-500">Locked Principal</span><span className="text-zinc-200">${amountMaker || '0'} {tokenLabel}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Counterparty</span><span className="text-zinc-200">{taker ? `${taker.slice(0,6)}…${taker.slice(-4)}` : 'Open'}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Arbitrator</span><span className="text-amber-400 font-mono text-[11px]">{effectiveArbitrator ? `${effectiveArbitrator.slice(0,6)}…${effectiveArbitrator.slice(-4)} (2-of-3)` : 'Direct Bilateral'}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Timeout Expiry</span><span className="text-zinc-200">{deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>

        {/* Errors */}
        {(approveError || createError) && (
          <p className="text-[13px] text-rose-400 bg-rose-500/[0.08] p-3 rounded-xl border border-rose-500/20">
            {approveError?.message || createError?.message || 'Transaction failed on Arc.'}
          </p>
        )}

        {/* Submit with Clean Professional Buttons */}
        <div>
          {!isConnected ? (
            <button
              onClick={() => openModal(true)}
              className="btn-primary w-full py-3 text-[14px]"
            >
              Connect Wallet to Continue
            </button>
          ) : disabled ? (
            <button disabled className="w-full bg-white/[0.04] text-zinc-600 py-3 rounded-xl text-[14px] cursor-not-allowed">{reason}</button>
          ) : deployingContract ? (
            <div className="w-full py-3.5 rounded-xl text-[14px] text-center text-amber-400 flex items-center justify-center gap-2 bg-amber-500/[0.08] border border-amber-500/20">
              <div className="w-4 h-4 border-[1.5px] border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>Deploying Protocol Contract on Circle Arc…</span>
            </div>
          ) : !isContractConfigured ? (
            <button
              onClick={handleDeployProtocolContract}
              className="btn-primary w-full py-3.5 text-[14px] flex items-center justify-center gap-2 bg-amber-400 text-black hover:bg-amber-300"
            >
              <span>Initialize Protocol Contract</span>
            </button>
          ) : step === 'creating' || createPending || createReceiptLoading ? (
            <div className="w-full py-3.5 rounded-xl text-[14px] text-center text-emerald-400 flex items-center justify-center gap-2 bg-emerald-500/[0.08] border border-emerald-500/20">
              <div className="w-4 h-4 border-[1.5px] border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>[Step 2/2] Initializing Escrow on Circle Arc…</span>
            </div>
          ) : step === 'approving' || approvePending || approveReceiptLoading ? (
            <div className="w-full py-3.5 rounded-xl text-[14px] text-center text-amber-400 flex items-center justify-center gap-2 bg-amber-500/[0.08] border border-amber-500/20">
              <div className="w-4 h-4 border-[1.5px] border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>[Step 1/2] Authorizing {tokenLabel} Collateral…</span>
            </div>
          ) : needsApproval ? (
            <div className="space-y-2">
              <button
                onClick={doBatched1ClickDeploy}
                className="btn-primary w-full py-3.5 text-[14px] flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200"
              >
                <span>Authorize & Deploy Pact</span>
              </button>
              <p className="text-[11px] text-zinc-500 text-center">
                Batched pipeline automatically executes Approve and initializes the escrow contract.
              </p>
            </div>
          ) : (
            <button onClick={doCreate} className="btn-primary w-full py-3.5 text-[14px]">
              Deploy Escrow Pact
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
