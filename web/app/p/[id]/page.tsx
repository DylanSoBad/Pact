'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { formatUnits, isAddress } from 'viem'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { toast } from 'sonner'
import { ERC20_ABI, PACT_ABI } from '../../../lib/abi'
import { USDC_ERC20, arcTestnet, getPactAddress } from '../../../lib/arc'
import { PactData, fetchSinglePact } from '../../../lib/reads'
import { formatAmount, formatDate, isTerminal, kindLabel, statusLabel, tokenSymbol, truncateAddress } from '../../../lib/format'
import { hashPactTerms, hashTerms, verifyPactTerms } from '../../../lib/terms'
import { signPermit, type PermitAuthorization } from '../../../lib/permit'
import PactStateMachine from '../../../components/PactStateMachine'
import Countdown from '../../../components/Countdown'
import TransactionProgress, { type TransactionStage } from '../../../components/TransactionProgress'
import { transactionErrorMessage } from '../../../lib/transactionErrors'

type DisputeData = {
  opener: `0x${string}`
  claim: number
  makerBond: bigint
  takerBond: bigint
  openedAt: bigint
  responseDeadline: bigint
  arbiterDeadline: bigint
}

export default function PactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const id = Number(idParam)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
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

  const refresh = useCallback(async () => {
    setLoading(true)
    const current = await fetchSinglePact(id)
    setPact(current)
    if (current && protocolAddress && publicClient && current.status === 3) {
      try {
        const value = await publicClient.readContract({ address: protocolAddress, abi: PACT_ABI, functionName: 'getDispute', args: [BigInt(id)] })
        setDispute({ ...value, claim: Number(value.claim) })
      } catch { setDispute(null) }
    } else {
      setDispute(null)
    }

    if (current && address && protocolAddress && publicClient) {
      const tokens = [...new Set([current.tokenMaker, current.tokenTaker, USDC_ERC20].filter(token => isAddress(token)))] as `0x${string}`[]
      const balances = await Promise.all(tokens.map(async token => [token, await publicClient.readContract({ address: protocolAddress, abi: PACT_ABI, functionName: 'credits', args: [address, token] })] as const))
      setCredits(Object.fromEntries(balances))
    }
    setLoading(false)
  }, [address, id, protocolAddress, publicClient])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { document.title = `PACT · #${id}` }, [id])

  async function ensureExactAllowance(token: `0x${string}`, amount: bigint): Promise<PermitAuthorization | null> {
    if (amount === 0n || !address || !protocolAddress || !publicClient || !walletClient) return null
    const current = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [address, protocolAddress] })
    if (current === amount) return null
    setBusyLabel(`Authorize exactly ${formatUnits(amount, 6)} ${tokenSymbol(token)}`)
    setTxStage('awaiting-signature')
    setTxLabel(`Authorize exactly ${formatUnits(amount, 6)} ${tokenSymbol(token)}. No unlimited allowance is requested.`)
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
      const simulation = await publicClient.simulateContract({ account: address, address: token, abi: ERC20_ABI, functionName: 'approve', args: [protocolAddress, value] })
      const hash = await walletClient.writeContract(simulation.request)
      setTxHash(hash)
      setTxStage('confirming')
      setTxLabel(`Exact ${tokenSymbol(token)} approval is being confirmed on Arc Testnet.`)
      await publicClient.waitForTransactionReceipt({ hash })
    }
    if (current !== 0n) await approve(0n)
    await approve(amount)
    return null
  }

  async function execute(functionName: string, args: readonly unknown[], label: string) {
    if (!address || !protocolAddress || !publicClient || !walletClient) {
      toast.error('Connect a wallet on Arc Testnet')
      return
    }
    try {
      setBusyLabel(label)
      setTxHash(null)
      setTxError('')
      setTxStage('awaiting-signature')
      setTxLabel(`${label}. Confirm this action in your wallet.`)
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
      setTxLabel(`${label} is waiting for on-chain confirmation.`)
      await publicClient.waitForTransactionReceipt({ hash })
      setTxStage('success')
      setTxLabel(`${label} was confirmed on Arc Testnet.`)
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

  async function acceptPact() {
    if (!pact) return
    const expectedTermsHash = canonicalTermsHash(pact, protocolAddress, termsInput)
    if (!expectedTermsHash || expectedTermsHash !== pact.termsHash) {
      toast.error('Paste the exact written terms. The hash must match before acceptance.')
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
        'Accept pact and escrow collateral',
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
        action === 'openDispute' ? 'Open dispute' : 'Respond to dispute',
      )
    } catch (error) {
      setBusyLabel('')
      const message = transactionErrorMessage(error)
      setTxStage('error')
      setTxError(message)
      toast.error(message)
    }
  }

  if (loading) return <div className="pact-panel p-8 text-center text-sm text-text-muted">Reading verified pact state…</div>
  if (!protocolAddress) return <div className="pact-panel p-8"><h1 className="text-xl text-white">Protocol unavailable</h1><p className="mt-2 text-sm text-text-muted">This build has no official PACT address for Arc Testnet.</p></div>
  if (!pact) return <div className="pact-panel p-8"><h1 className="text-xl text-white">Pact not found</h1><Link href="/" className="mt-4 inline-block text-primary-fixed">← Return to overview</Link></div>

  const now = BigInt(Math.floor(Date.now() / 1000))
  const normalizedAddress = address?.toLowerCase()
  const isMaker = normalizedAddress === pact.maker.toLowerCase()
  const isTaker = normalizedAddress === pact.taker.toLowerCase()
  const isArbiter = normalizedAddress === pact.arbiter.toLowerCase()
  const isRespondent = dispute && normalizedAddress === (dispute.opener.toLowerCase() === pact.maker.toLowerCase() ? pact.taker.toLowerCase() : pact.maker.toLowerCase())
  const canAccept = isTaker && pact.status === 0 && now <= pact.offerExpiry
  const canSubmitProof = isTaker && pact.status === 1 && now <= pact.performanceDeadline
  const canRelease = isMaker && (pact.status === 1 || pact.status === 2)
  const canOpenDispute = (isMaker || isTaker) && (pact.status === 1 || pact.status === 2) && now <= pact.disputeDeadline
  const canRespond = Boolean(isRespondent && dispute && dispute.arbiterDeadline === 0n && now <= dispute.responseDeadline)
  const canRule = Boolean(isArbiter && dispute && dispute.arbiterDeadline > 0n && now <= dispute.arbiterDeadline)
  const canDefault = Boolean(dispute && dispute.arbiterDeadline === 0n && now > dispute.responseDeadline)
  const canArbiterTimeout = Boolean(dispute && dispute.arbiterDeadline > 0n && now > dispute.arbiterDeadline)
  const canDeadlineSettle = (pact.status === 0 && now > pact.offerExpiry) || ((pact.status === 1 || pact.status === 2) && now > pact.disputeDeadline)
  const canCancel = isMaker && pact.status === 0
  const busy = Boolean(busyLabel)
  const uniqueTokens = [...new Set([pact.tokenMaker, pact.tokenTaker, USDC_ERC20].filter(token => isAddress(token)))]
  const pactTerms = toCanonicalTerms(pact, protocolAddress)
  const termsMatch = Boolean(termsInput && pactTerms && verifyPactTerms(pactTerms, termsInput, pact.termsHash as `0x${string}`))

  return (
    <div className="mx-auto w-full max-w-terminal font-mono">
      <header className="mb-7 flex flex-col justify-between gap-4 border-b border-outline-hairline pb-5 @md:flex-row @md:items-end">
        <div><p className="pact-eyebrow mb-2">Agreement record</p><h1 className="text-[28px] font-semibold text-white">Pact #{String(id).padStart(4, '0')}</h1><p className="mt-2 text-[12px] text-text-muted">{kindLabel(pact.kind)} · {statusLabel(pact.status)}</p></div>
        <a href={`https://testnet.arcscan.app/address/${protocolAddress}`} target="_blank" rel="noreferrer" className="text-[11px] text-primary-fixed">Verified contract ↗</a>
      </header>

      <PactStateMachine status={pact.status} />

      <div className="mb-6 grid gap-px border border-outline-hairline bg-outline-hairline @md:grid-cols-3">
        <div className="bg-[#0c0d10] p-4"><span className="text-[10px] uppercase text-text-muted">Maker</span><p className="mt-2 text-[12px] text-white">{truncateAddress(pact.maker)}</p><p className="mt-1 text-primary-fixed">{formatAmount(pact.amountMaker)} {tokenSymbol(pact.tokenMaker)}</p></div>
        <div className="bg-[#0c0d10] p-4"><span className="text-[10px] uppercase text-text-muted">Counterparty</span><p className="mt-2 text-[12px] text-white">{truncateAddress(pact.taker)}</p><p className="mt-1 text-primary-fixed">{formatAmount(pact.amountTaker)} {pact.amountTaker > 0n ? tokenSymbol(pact.tokenTaker) : ''}</p></div>
        <div className="bg-[#0c0d10] p-4"><span className="text-[10px] uppercase text-text-muted">Arbiter</span><p className="mt-2 text-[12px] text-white">{truncateAddress(pact.arbiter)}</p><p className="mt-1 text-text-muted">Fee cap {formatAmount(pact.arbiterFeeCap)} USDC</p></div>
      </div>

      <section className="pact-panel mb-6 p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-white">Committed deadlines</h2>
        <div className="mt-4 grid gap-4 text-[11px] @md:grid-cols-3">
          <p className="text-text-muted">Offer expiry<span className="mt-1 block text-white">{formatDate(pact.offerExpiry)}</span></p>
          <p className="text-text-muted">Performance deadline<span className="mt-1 block text-white">{formatDate(pact.performanceDeadline)}</span></p>
          <p className="text-text-muted">Dispute deadline<span className="mt-1 block text-white">{formatDate(pact.disputeDeadline)}</span></p>
        </div>
        {!isTerminal(pact.status) && <div className="mt-4 border-t border-zinc-800 pt-4"><Countdown deadlineTs={pact.status === 0 ? pact.offerExpiry : pact.disputeDeadline} /></div>}
      </section>

      <section className="pact-panel mb-6 p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-white">Written terms commitment</h2>
        <p className="mt-3 break-all text-[10px] text-primary-fixed">{pact.termsHash}</p>
        <textarea value={termsInput} onChange={event => setTermsInput(event.target.value)} rows={4} placeholder="Paste the exact written terms to verify locally…" className="mt-4 w-full resize-y border border-zinc-800 bg-black p-3 text-[12px] text-white outline-none focus:border-primary-fixed" />
        <p className={`mt-2 text-[11px] ${termsMatch ? 'text-primary-fixed' : 'text-text-muted'}`}>{termsMatch ? '✓ Text and every economic field match' : 'Acceptance is disabled until text and all on-chain economic fields match.'}</p>
      </section>

      {dispute && <section className="mb-6 border border-status-warning/50 bg-status-warning/10 p-5"><h2 className="text-[12px] font-semibold uppercase text-[#f7d36b]">Dispute active</h2><div className="mt-3 grid gap-3 text-[11px] text-text-muted @sm:grid-cols-2"><p>Opener <span className="block text-white">{truncateAddress(dispute.opener)}</span></p><p>Claim <span className="block text-white">{dispute.claim === 1 ? 'Maker wins all' : 'Taker wins all'}</span></p><p>Response deadline <span className="block text-white">{formatDate(dispute.responseDeadline)}</span></p><p>Arbiter deadline <span className="block text-white">{dispute.arbiterDeadline ? formatDate(dispute.arbiterDeadline) : 'Awaiting counter-bond'}</span></p></div></section>}

      {isConnected && !isTerminal(pact.status) && (
        <section className="pact-panel mb-6 space-y-3 p-5">
          {canAccept && <button disabled={busy || !termsMatch} onClick={acceptPact} className="btn-primary w-full py-3 disabled:opacity-40">Verify terms, approve exact collateral & accept</button>}
          {canSubmitProof && <div className="space-y-2"><input value={proofInput} onChange={event => setProofInput(event.target.value)} placeholder="Proof reference or content hash source" className="w-full border border-zinc-800 bg-black p-3 text-[12px] text-white outline-none" /><button disabled={busy || !proofInput} onClick={() => execute('submitProof', [BigInt(id), hashTerms(proofInput)], 'Submit proof')} className="btn-primary w-full py-3 disabled:opacity-40">Submit proof commitment</button></div>}
          {canRelease && <button disabled={busy} onClick={() => execute('release', [BigInt(id)], 'Release all collateral to counterparty')} className="btn-primary w-full py-3">Release & settle to counterparty</button>}
          {canOpenDispute && <button disabled={busy} onClick={() => openOrRespondDispute('openDispute')} className="btn-ghost w-full border-status-warning/40 py-3 text-[#f7d36b]">Open dispute · bond {formatAmount(pact.bondAmount)} USDC</button>}
          {canRespond && <button disabled={busy} onClick={() => openOrRespondDispute('respondDispute')} className="btn-primary w-full py-3">Counter-bond & contest claim</button>}
          {canRule && <div className="space-y-2 border border-zinc-800 p-4"><label className="text-[11px] text-text-muted">Arbiter fee claimed (USDC)<input value={feeInput} onChange={event => setFeeInput(event.target.value)} className="mt-2 w-full border border-zinc-800 bg-black p-2 text-white" /></label><div className="grid grid-cols-2 gap-2"><button onClick={() => execute('ruleDispute', [BigInt(id), 1, parseUnitsSafe(feeInput)], 'Rule for maker')} className="btn-primary py-3">Maker wins</button><button onClick={() => execute('ruleDispute', [BigInt(id), 2, parseUnitsSafe(feeInput)], 'Rule for taker')} className="btn-primary py-3">Taker wins</button></div></div>}
          {canDefault && <button disabled={busy} onClick={() => execute('resolveUnansweredDispute', [BigInt(id)], 'Resolve unanswered dispute')} className="btn-primary w-full py-3">Execute default judgment</button>}
          {canArbiterTimeout && <button disabled={busy} onClick={() => execute('arbiterTimeout', [BigInt(id)], 'Execute arbiter timeout')} className="btn-primary w-full py-3">Refund bonds & split collateral 50/50</button>}
          {canDeadlineSettle && <button disabled={busy} onClick={() => execute('refundAfterDeadline', [BigInt(id)], 'Settle after deadline')} className="btn-ghost w-full py-3">Settle after deadline</button>}
          {canCancel && <button disabled={busy} onClick={() => execute('cancelPact', [BigInt(id)], 'Cancel offered pact')} className="btn-ghost w-full py-3">Cancel offer & credit refund</button>}
        </section>
      )}

      {Object.values(credits).some(value => value > 0n) && <section className="pact-panel mb-6 p-5"><h2 className="text-[12px] font-semibold uppercase tracking-widest text-white">Claimable credits</h2><div className="mt-4 space-y-2">{uniqueTokens.map(token => credits[token] > 0n && <button key={token} disabled={busy} onClick={() => execute('withdraw', [token], `Withdraw ${tokenSymbol(token)}`)} className="btn-primary flex w-full justify-between px-4 py-3"><span>{tokenSymbol(token)}</span><span>{formatAmount(credits[token])}</span></button>)}</div></section>}

      <TransactionProgress stage={txStage} label={txLabel || busyLabel} hash={txHash} error={txError} onDismiss={() => { setTxStage('idle'); setTxError(''); setTxHash(null) }} />
    </div>
  )
}

function parseUnitsSafe(value: string): bigint {
  try { return BigInt(Math.round(Number(value || 0) * 1_000_000)) } catch { return 0n }
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
