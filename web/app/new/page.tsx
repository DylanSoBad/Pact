'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useAccount, useWalletClient, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from 'wagmi'
import { useModal } from 'connectkit'
import { parseUnits, formatUnits, maxUint256, decodeEventLog, isAddress } from 'viem'
import { toast } from 'sonner'
import { PACT_ABI, ERC20_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC, getPactAddress } from '../../lib/arc'
import { PACT_BYTECODE } from '../../lib/bytecode'
import { hashTerms } from '../../lib/terms'
import { fetchReputation } from '../../lib/reads'
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

const TEMPLATES = [
  { label: 'Delivery', text: 'Delivery of physical goods. Must provide valid tracking URL upon fulfillment.' },
  { label: 'Freelance', text: 'Completion of coding task. Must provide GitHub PR and passing tests.' },
  { label: 'OTC Swap', text: 'Atomic exchange of digital assets. No extra conditions.' },
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
  const [deadlineMinutes, setDeadlineMinutes] = useState('1440')
  const [blurSize, setBlurSize] = useState(false)
  const [confirmation, setConfirmation] = useState<'approve' | 'create' | null>(null)
  const [bannersCollapsed, setBannersCollapsed] = useState(false)


  const [step, setStep] = useState<'form' | 'approving' | 'creating' | 'done'>('form')
  const [createdPactId, setCreatedPactId] = useState<number | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  
  const [reputation, setReputation] = useState<{ cleared: number; slashed: number; notional: bigint } | null>(null)
  const [repLoading, setRepLoading] = useState(false)

  useEffect(() => {
    document.title = 'PACT · New Pact'
    const addr = getPactAddress()
    setPactAddress(addr)
  }, [])

  useEffect(() => setBannersCollapsed(localStorage.getItem('pact-hide-network-banners') === 'true'), [])

  // Auto-fetch reputation when counterparty address is valid
  useEffect(() => {
    if (taker && isAddress(taker)) {
      setRepLoading(true)
      fetchReputation(taker as `0x${string}`).then(r => {
        setReputation(r)
        setRepLoading(false)
      })
    } else {
      setReputation(null)
    }
  }, [taker])

  // 1-Click Batched Flow Ref
  const isBatchedRef = useRef(false)
  const wasConnectedRef = useRef(false)

  useEffect(() => {
    if (wasConnectedRef.current && !isConnected) toast.warning('Wallet disconnected')
    wasConnectedRef.current = isConnected
  }, [isConnected])

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

  const termsH = hashTerms(terms)
  const needsTakerToken = kind === 1 || parseTaker() > 0n
  const effectiveTokenTaker = needsTakerToken ? tokenTaker : '0x0000000000000000000000000000000000000000'
  const deadline = new Date(Date.now() + Number(deadlineMinutes || 0) * 60000)
  const deadlineHours = Number(deadlineMinutes || 0) / 60
  const deadlineRelative = deadlineHours >= 24 && deadlineHours % 24 === 0 ? `in ${deadlineHours / 24}d` : deadlineHours >= 1 && Number.isInteger(deadlineHours) ? `in ${deadlineHours}h` : `in ${deadlineMinutes || '0'}m`
  const deadlineShort = deadline.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const deadlineTs = BigInt(Math.floor(deadline.getTime() / 1000))

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const makerBn = parseMaker()
  const hasBalance = address ? makerBn <= makerBalance : true
  const needsApproval = isConnected && makerBn > currentAllowance
  const tokenLabel = TOKENS.find(t => t.value === tokenMaker)?.label || 'tokens'
  const amountError = !amountMaker || makerBn <= 0n
  const sellerBondError = !!amountTaker && parseTaker() < 0n
  const termsError = !terms.trim()
  const deadlineError = !deadlineMinutes || !Number.isFinite(Number(deadlineMinutes)) || deadline.getTime() <= Date.now()
  const fieldClass = (invalid: boolean) => `w-full bg-[#07080a] border ${invalid ? 'border-status-error' : 'border-zinc-800 hover:border-zinc-600'} text-[#c8f542] px-3.5 py-2.5 rounded-none text-[14px] placeholder:text-zinc-700 focus:border-[#c8f542] transition-none outline-none focus:ring-0`

  let disabled = false, reason = ''
  if (amountError) { disabled = true; reason = 'Amount must be greater than zero' }
  else if (isConnected && !hasBalance) { disabled = true; reason = `Not enough ${tokenLabel}` }
  else if (sellerBondError) { disabled = true; reason = 'Seller bond must be zero or greater' }
  else if (termsError) { disabled = true; reason = 'Agreement terms are required' }
  else if (deadlineError) { disabled = true; reason = 'Settlement deadline must be in the future' }
  else if (kind === 1 && (!amountTaker || parseTaker() === 0n)) { disabled = true; reason = 'Enter counterparty amount' }
  else if (taker && !isAddress(taker)) { disabled = true; reason = 'Invalid counterparty address' }

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
          toast.success('Protocol contract initialized')
        }
      }
    } catch (err: any) {
      console.error('Deployment error:', err)
      toast.error('Failed to initialize protocol contract')
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
    if (approveError) {
      setStep('form')
      isBatchedRef.current = false
      toast.error(`Transaction failed: ${approveError.message || 'approval was rejected'}`)
    }
    if (createError) {
      setStep('form')
      isBatchedRef.current = false
      toast.error(`Transaction failed: ${createError.message || 'pact creation was rejected'}`)
    }
  }, [approveError, createError])

  useEffect(() => {
    if (createConfirmed && createReceipt) {
      setStep('done')
      toast.success('Pact created successfully')
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

  const confirmTransaction = () => {
    const action = confirmation
    setConfirmation(null)
    if (action === 'approve') doBatched1ClickDeploy()
    if (action === 'create') doCreate()
  }

  const fillDemo = () => {
    setKind(0)
    setTokenMaker(USDC_ERC20)
    setTokenTaker(USDC_ERC20)
    setAmountMaker('10')
    setAmountTaker('2')
    setTerms('Delivery of 1x Server Hardware unit to Singapore DC. Courier tracking reference required upon fulfillment.')
    setDeadlineMinutes('1440')
    toast.info('Demo data filled. Review before submitting.')
  }

  const clearDemo = () => {
    setAmountMaker('')
    setAmountTaker('')
    setTaker('')
    setTerms('')
    setDeadlineMinutes('1440')
    toast.info('Form cleared')
  }

  const toggleBanners = () => {
    setBannersCollapsed(value => {
      localStorage.setItem('pact-hide-network-banners', String(!value))
      return !value
    })
  }

  const shareUrl = createdPactId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${createdPactId}?terms=${encodeURIComponent(terms)}`
    : ''

  const copyLink = () => { if (shareUrl) { navigator.clipboard.writeText(shareUrl); setCopiedLink(true); toast.success('Link copied to clipboard!'); setTimeout(() => setCopiedLink(false), 2500) } }

  const mc = kind === 0 ? { m: 'Your deposit', t: 'Seller bond', ma: 'Payment', ta: 'Collateral' }
    : kind === 1 ? { m: 'You lock', t: 'They lock', ma: 'Amount', ta: 'Amount' }
    : { m: 'Bounty', t: 'Worker bond', ma: 'Bounty', ta: 'Bond (optional)' }

  // ── Success ──
  if (step === 'done' && createConfirmed) {
    return (
      <main className="min-h-screen max-w-[580px] mx-auto px-5 @md:px-8 pb-20 overflow-x-hidden font-mono">
                <div className="text-center py-16 animate-enter border border-zinc-800 bg-[#0c0d10] mt-8 p-8">
          <div className="w-14 h-14 bg-[#c8f542] text-black flex items-center justify-center mx-auto mb-5 text-xl font-bold rounded-none">✓</div>
          <h2 className="text-xl font-semibold text-white mb-1">
            Pact {createdPactId ? `#${createdPactId.toString().padStart(4, '0')}` : ''} created
          </h2>
          <p className="text-[14px] text-zinc-500 mb-8">${amountMaker} {tokenLabel} locked on-chain via Arc Native Settlement.</p>

          {createdPactId && (
            <div className="surface-1 p-4 mb-8 text-left max-w-sm mx-auto">
              <p className="text-[12px] text-zinc-500 mb-2">Share with counterparty</p>
              <div className="flex gap-2">
                <input readOnly value={shareUrl} className="flex-1 bg-black border border-zinc-700 text-[#c8f542] px-3 py-2 rounded-none text-[12px] font-mono select-all focus:ring-0 outline-none" />
                <button onClick={copyLink} className="btn-primary px-4 py-2 text-[12px]">
                  {copiedLink ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col @md:flex-row items-center justify-center gap-3">
            {createdPactId ? (
              <Link href={`/p/${createdPactId}?terms=${encodeURIComponent(terms)}`}
                className="btn-primary px-6 py-2.5 text-[13px]">
                Open pact →
              </Link>
            ) : (
              <Link href="/" className="btn-primary px-6 py-2.5 text-[13px]">
                Dashboard →
              </Link>
            )}
            <button
              onClick={() => {
                setStep('form')
                setCreatedPactId(null)
                setDeployTxHash(null)
                setAmountMaker('')
                setAmountTaker('')
                setTerms('')
              }}
              className="btn-ghost px-4 py-2.5 text-[13px] text-zinc-400 border border-zinc-800"
            >
              Create another pact +
            </button>
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
    <div className="w-full max-w-terminal mx-auto font-mono">
      
      <button type="button" onClick={toggleBanners} className="mb-3 flex w-full items-center justify-between border border-outline-border px-3 py-2 text-[11px] text-text-muted hover:text-primary-fixed" aria-expanded={!bannersCollapsed}>
        <span>{bannersCollapsed ? 'Network and risk notices hidden' : 'Hide network and risk notices'}</span><span aria-hidden="true" className="material-symbols-outlined text-[16px]">{bannersCollapsed ? 'expand_more' : 'expand_less'}</span>
      </button>
      {!bannersCollapsed && <><div className="mb-3 p-3 bg-[#c8f542]/10 border border-[#c8f542]/30 flex items-center justify-between text-[12px] text-[#c8f542] animate-enter rounded-none">
        <div className="flex items-center gap-2">
          <span><strong>Arc Testnet:</strong> Native USDC Gas · Direct On-Chain Pact</span>
        </div>
        <span className="bg-[#c8f542]/20 px-2 py-0.5 text-[10px] font-mono border border-[#c8f542]/30 rounded-none">
          Chain ID 5042002
        </span>
      </div>

      <div role="note" className="mb-6 p-3 border border-status-warning/60 bg-status-warning/10 text-[12px] text-[#f7d36b]">
        <strong>⚠ Testnet deployment.</strong> Smart contracts involve risk. Always verify terms before locking collateral.
      </div>
      </>}

      {isWrongChain && (
        <div className="bg-rose-500/[0.08] border border-rose-500/20 p-3.5 mb-6 text-[13px] flex items-center justify-between text-rose-300 rounded-none">
          <span>Wrong network</span>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            className="btn-primary bg-rose-500 border-rose-500 text-black px-3.5 py-1 text-[12px]">
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
        <div className="flex gap-2"><button onClick={fillDemo} title="Auto-fill with sample values for testing" className="btn-ghost px-3 py-1 text-[12px] text-zinc-400">Fill Demo</button><button onClick={clearDemo} className="btn-ghost px-3 py-1 text-[12px] text-zinc-400">Clear</button></div>
      </div>

      <div className="space-y-8 animate-enter-delay">
        {/* Type */}
        <div>
          <label className="text-[13px] text-zinc-500 block mb-3">Pact Archetype</label>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map(k => (
              <label key={k.value} className={`pill-interactive p-3.5 cursor-pointer transition-none text-center border ${
                kind === k.value
                  ? 'bg-[#c8f542]/10 border-[#c8f542] text-[#c8f542]'
                  : 'bg-black border-zinc-800 hover:border-zinc-600'
              }`}>
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                <span className={`text-[13px] font-bold tracking-wider block mb-0.5 ${kind === k.value ? 'text-[#c8f542]' : 'text-zinc-400'}`}>{k.label}</span>
                <span className="text-[10px] text-zinc-600 block uppercase tracking-widest">{k.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Amounts */}
        <div className="space-y-4">
          <label className="text-[13px] text-zinc-500 block">Collateral & Tokens</label>
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
            <TokenSelect label={mc.m} tokens={TOKENS} value={tokenMaker} onChange={setTokenMaker} />
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[12px] text-zinc-500">{mc.ma}</label>
                {address && (
                  <span className="text-[11px] text-zinc-600">
                    {formatUnits(makerBalance, makerDecimals)}{' '}
                    <button onClick={() => { 
                      if (makerBalance > 0n) {
                        let maxBal = makerBalance
                        // Reserve 0.05 USDC for gas if using USDC
                        if (tokenMaker === USDC_ERC20) {
                          const gasReserve = 50000n 
                          maxBal = makerBalance > gasReserve ? makerBalance - gasReserve : 0n
                        }
                        setAmountMaker(formatUnits(maxBal, makerDecimals))
                      }
                    }}
                      className="text-[#c8f542] hover:text-[#d6fa61] cursor-pointer font-bold active:scale-90 transition-transform">MAX</button>
                  </span>
                )}
              </div>
              <input aria-invalid={amountError} type="number" min="0" value={amountMaker} onChange={e => setAmountMaker(e.target.value)} placeholder="0.00" className={fieldClass(amountError)} />
              {amountError && <p className="mt-1 text-[11px] text-status-error">Amount must be greater than zero</p>}
            </div>
          </div>

          <div className="separator" />

          <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
            <TokenSelect label={mc.t} tokens={TOKENS} value={tokenTaker} onChange={setTokenTaker} />
            <div>
              <label className="text-[12px] text-zinc-500 block mb-1.5">{mc.ta}</label>
              <input aria-invalid={sellerBondError} type="number" min="0" value={amountTaker} onChange={e => setAmountTaker(e.target.value)}
                placeholder={kind === 1 ? '0.00' : '0.00 (optional)'}
                className={fieldClass(sellerBondError)} />
              {sellerBondError && <p className="mt-1 text-[11px] text-status-error">Seller bond must be zero or greater</p>}
            </div>
          </div>

          <div className="separator" />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] text-zinc-500 block">
                Designated Counterparty <span className="text-zinc-700">· leave empty for open candidate pool</span>
              </label>
              {reputation && (
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider bg-[#18181b] px-2 py-0.5 border border-zinc-800">
                  <span className="text-zinc-400">Trust Score:</span>
                  <span className="text-[#c8f542]">{reputation.cleared} Cleared</span>
                  {reputation.slashed > 0 && <span className="text-rose-400">/ {reputation.slashed} Slashed</span>}
                </div>
              )}
              {repLoading && <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Checking rep...</div>}
            </div>
            <input type="text" value={taker} onChange={e => setTaker(e.target.value)} placeholder="0x…"
              className="w-full bg-[#07080a] border border-zinc-800 hover:border-zinc-600 text-white px-3.5 py-2.5 rounded-none text-[14px] font-mono placeholder:text-zinc-700 focus:border-[#c8f542] transition-none outline-none focus:ring-0" />
          </div>
        </div>


        {/* Terms */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-[13px] text-zinc-500">Agreement terms & fulfillment condition</label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 hidden @md:inline">Templates:</span>
              {TEMPLATES.map(t => (
                <button key={t.label} type="button" onClick={() => setTerms(t.text)} aria-pressed={terms === t.text} className={`min-h-11 px-3 text-[11px] border transition-colors ${terms === t.text ? 'bg-[#c8f542]/15 border-[#c8f542] text-[#c8f542]' : 'bg-zinc-900 border-zinc-800 hover:border-[#c8f542] text-zinc-400 hover:text-[#c8f542]'}`}>
                  {t.label}
                </button>
              ))}
              <span className={`text-[11px] ml-2 ${termsError ? 'text-status-error' : 'text-zinc-500'}`}>{terms.length}/500</span>
            </div>
          </div>
          <textarea aria-invalid={termsError} maxLength={500} value={terms} onChange={e => setTerms(e.target.value)} rows={3}
            placeholder="Describe delivery condition, tracking number, or milestone specification…"
            className={`w-full bg-[#07080a] border ${termsError ? 'border-status-error' : 'border-zinc-800 hover:border-zinc-600'} text-white px-3.5 py-2.5 rounded-none text-[13px] leading-relaxed placeholder:text-zinc-700 focus:border-[#c8f542] resize-none transition-none outline-none focus:ring-0`} />
          {termsError && <p className="mt-1 text-[11px] text-status-error">Agreement terms cannot be empty</p>}
          {terms && <p className="text-[11px] text-zinc-600 mt-1.5 font-mono">SHA-256 Digest: {termsH.slice(0, 24)}…</p>}
        </div>

        {/* Deadline & Session Key Features */}
        <div>
          <label className="text-[13px] text-zinc-500 block mb-2">Settlement Deadline</label>
          <div className="flex items-center gap-2">
            <div className="flex flex-1"><input aria-invalid={deadlineError} type="number" value={deadlineMinutes} onChange={e => setDeadlineMinutes(e.target.value)} min="1" className={`${fieldClass(deadlineError)} min-w-0`} /><span className="border border-l-0 border-zinc-800 px-3 py-2.5 text-[12px] text-text-muted">minutes</span></div>
            {[{ m: 30, l: '30m' }, { m: 60, l: '1h' }, { m: 360, l: '6h' }, { m: 1440, l: '24h' }, { m: 10080, l: '7d' }].map(p => (
              <button key={p.m} type="button" onClick={() => setDeadlineMinutes(p.m.toString())}
                aria-pressed={deadlineMinutes === p.m.toString()} className={`pill-interactive px-3 py-2.5 border text-[13px] transition-none rounded-none ${deadlineMinutes === p.m.toString() ? 'bg-[#c8f542]/15 border-[#c8f542] text-[#c8f542]' : 'bg-[#07080a] border-zinc-800 hover:border-[#c8f542] text-zinc-400 hover:text-[#c8f542]'}`}>
                {p.l}
              </button>
            ))}
          </div>
          {deadlineError ? <p className="text-[11px] text-status-error mt-1.5">Settlement deadline must be in the future</p> : <p className="text-[11px] text-zinc-500 mt-1.5" title={deadline.toLocaleString()}>{deadlineRelative} ({deadlineShort})</p>}

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={blurSize} onChange={e => setBlurSize(e.target.checked)}
                className="w-4 h-4 rounded-none border-zinc-700 bg-[#07080a] text-[#c8f542] focus:ring-[#c8f542]/30 focus:ring-offset-0 outline-none" />
              <span className="text-[13px] text-zinc-400" title="Amounts remain readable in on-chain calldata">blur amount in UI (still public onchain)</span>
            </label>
          </div>
        </div>

        {/* Summary */}
        <div className="surface-1 p-4 text-[13px] space-y-2 border border-zinc-800 rounded-none">
          <p className="text-zinc-500 text-[12px] mb-3 uppercase tracking-widest">Settlement Summary</p>
          <div className="flex justify-between"><span className="text-zinc-500">Total locked principal</span><span className="text-[#c8f542]">{amountMaker || '0'} + {amountTaker || '0'} {tokenLabel}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Counterparty</span><span className="text-zinc-200">{taker ? `${taker.slice(0,6)}…${taker.slice(-4)}` : 'Open'}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Arbitrator mode</span><span className="text-zinc-300 font-mono text-[11px]">Direct Bilateral</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Settlement deadline</span><span className="text-zinc-200 text-right" title={deadline.toLocaleString()}>{deadlineRelative}<br />{deadlineShort}</span></div>
        </div>

        {/* Errors */}
        {(approveError || createError) && (
          <p className="text-[13px] text-rose-400 bg-rose-500/[0.08] p-3 rounded-none border border-rose-500/20">
            {approveError?.message || createError?.message || 'Transaction failed on Arc.'}
          </p>
        )}

        {/* Submit with Clean Professional Buttons */}
        <div>
          {!isConnected ? (
            <button
              onClick={() => openModal(true)} disabled={disabled}
              className="btn-primary w-full py-3 text-[14px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disabled ? reason : 'Connect Wallet to Continue'}
            </button>
          ) : disabled ? (
            <button disabled className="w-full bg-[#18181b] border border-zinc-800 text-zinc-600 py-3 text-[13px] uppercase tracking-widest rounded-none cursor-not-allowed">{reason}</button>
          ) : deployingContract ? (
            <div className="w-full py-3.5 text-[14px] text-center text-[#c8f542] flex items-center justify-center gap-2 bg-[#c8f542]/10 border border-[#c8f542]/30 rounded-none">
              <div className="w-4 h-4 border-[1.5px] border-[#c8f542] border-t-transparent rounded-full animate-spin" />
              <span>Deploying Protocol Contract on Circle Arc…</span>
            </div>
          ) : !isContractConfigured ? (
            <button
              onClick={() => setConfirmation('approve')}
              className="btn-primary w-full py-3.5 text-[14px] flex items-center justify-center gap-2 rounded-none"
            >
              <span>Initialize Protocol Contract</span>
            </button>
          ) : step === 'creating' || createPending || createReceiptLoading ? (
            <div className="w-full py-3.5 text-[14px] text-center text-[#c8f542] flex items-center justify-center gap-2 bg-[#c8f542]/10 border border-[#c8f542]/30 rounded-none">
              <div className="w-4 h-4 border-[1.5px] border-[#c8f542] border-t-transparent rounded-full animate-spin" />
              <span>[Step 2/2] Initializing Pact on Circle Arc…</span>
            </div>
          ) : step === 'approving' || approvePending || approveReceiptLoading ? (
            <div className="w-full py-3.5 text-[14px] text-center text-[#c8f542] flex items-center justify-center gap-2 bg-[#c8f542]/10 border border-[#c8f542]/30 rounded-none">
              <div className="w-4 h-4 border-[1.5px] border-[#c8f542] border-t-transparent rounded-full animate-spin" />
              <span>[Step 1/2] Authorizing {tokenLabel} Collateral…</span>
            </div>
          ) : needsApproval ? (
            <div className="space-y-2">
              <button
                onClick={() => setConfirmation('approve')}
                className="btn-primary w-full py-3.5 text-[14px] flex items-center justify-center gap-2 rounded-none"
              >
                <span>Authorize & Deploy Pact</span>
              </button>
              <p className="text-[11px] text-zinc-500 text-center">
                Batched pipeline automatically executes Approve and initializes the pact contract.
              </p>
            </div>
          ) : (
            <button onClick={() => setConfirmation('create')} className="btn-primary w-full py-3.5 text-[14px]">
              Deploy Pact
            </button>
          )}
        </div>
      </div>
      {confirmation && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-lock-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md border border-primary-fixed bg-[#0c0d10] p-5 shadow-2xl">
            <h2 id="confirm-lock-title" className="text-primary-fixed font-display-mono text-lg">Confirm collateral lock</h2>
            <p className="mt-3 text-sm text-text-muted">You are about to lock {amountMaker || '0'} {tokenLabel}. Continue?</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmation(null)} className="min-h-11 px-4 border border-outline-border text-text-muted hover:text-on-surface">Cancel</button>
              <button type="button" autoFocus onClick={confirmTransaction} className="min-h-11 px-4 border border-primary-fixed bg-primary-fixed text-on-primary-fixed">Continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
