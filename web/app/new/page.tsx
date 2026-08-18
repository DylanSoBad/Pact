'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { PACT_ABI, ERC20_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC } from '../../lib/arc'
import { parseAmount } from '../../lib/format'
import { hashTerms } from '../../lib/terms'

const PACT_ADDRESS = process.env.NEXT_PUBLIC_PACT_ADDRESS as `0x${string}`

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

  const amountMakerParsed = parseAmount(amountMaker)
  const amountTakerParsed = kind === 1 ? parseAmount(amountTaker) : (amountTaker ? parseAmount(amountTaker) : 0n)
  const termsH = hashTerms(terms)

  const needsTakerToken = kind === 1 || amountTakerParsed > 0n
  const effectiveTokenTaker = needsTakerToken ? tokenTaker : '0x0000000000000000000000000000000000000000'

  const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineMinutes) * 60)

  async function handleApprove() {
    if (!isConnected) return
    setStep('approving')
    writeApprove({
      address: tokenMaker as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [PACT_ADDRESS, amountMakerParsed],
    })
  }

  async function handleCreate() {
    if (!isConnected) return
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
        amountMakerParsed,
        amountTakerParsed,
        deadlineTs,
        termsH,
        blurSize,
      ],
    })
  }

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

  return (
    <main className="min-h-screen max-w-[640px] mx-auto pt-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-[var(--color-muted)] font-mono text-sm hover:text-[var(--color-text)] transition-colors">
          ← TAPE
        </Link>
        <h1 className="text-2xl font-bold tracking-tight font-mono">NEW PACT</h1>
        <div className="w-16"></div>
      </div>

      <div className="space-y-6">
        {/* KIND */}
        <div>
          <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">Kind</label>
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                className={`flex-1 py-3 px-4 border font-mono text-sm transition-all cursor-pointer ${
                  kind === k.value
                    ? 'border-[var(--color-lime)] text-[var(--color-lime)] bg-[var(--color-lime)]/5'
                    : 'border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-muted)]'
                }`}
              >
                <div className="font-bold">{k.label}</div>
                <div className="text-xs mt-1 opacity-60">{k.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* MAKER TOKEN + AMOUNT */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">Token (You Lock)</label>
            <select
              value={tokenMaker}
              onChange={(e) => setTokenMaker(e.target.value)}
              className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none"
            >
              {TOKENS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">Amount</label>
            <input
              type="text"
              value={amountMaker}
              onChange={(e) => setAmountMaker(e.target.value)}
              placeholder="0.00"
              className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none"
            />
          </div>
        </div>

        {/* TAKER TOKEN + AMOUNT (conditional) */}
        {(kind === 1 || kind === 0) && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">
                {kind === 1 ? 'Token (They Lock)' : 'Bond Token (Taker)'}
              </label>
              <select
                value={tokenTaker}
                onChange={(e) => setTokenTaker(e.target.value)}
                className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none"
              >
                {TOKENS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">
                {kind === 1 ? 'Amount (They Lock)' : 'Bond Amount'}
              </label>
              <input
                type="text"
                value={amountTaker}
                onChange={(e) => setAmountTaker(e.target.value)}
                placeholder={kind === 1 ? '0.00' : '0 (optional)'}
                className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none"
              />
            </div>
          </div>
        )}

        {/* TAKER ADDRESS */}
        <div>
          <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">
            Taker Address <span className="opacity-50">(leave blank = open to anyone)</span>
          </label>
          <input
            type="text"
            value={taker}
            onChange={(e) => setTaker(e.target.value)}
            placeholder="0x…"
            className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none"
          />
        </div>

        {/* TERMS */}
        <div>
          <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">Terms</label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Describe the deal in plain text…"
            rows={4}
            className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none resize-none"
          />
          {terms && (
            <div className="text-xs font-mono text-[var(--color-muted)] mt-1 truncate">
              hash: {termsH}
            </div>
          )}
        </div>

        {/* DEADLINE + OPTIONS */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">Deadline (minutes from now)</label>
            <input
              type="number"
              value={deadlineMinutes}
              onChange={(e) => setDeadlineMinutes(e.target.value)}
              min="2"
              className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus:border-[var(--color-lime)] outline-none"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer font-mono text-sm pb-2">
              <input
                type="checkbox"
                checked={blurSize}
                onChange={(e) => setBlurSize(e.target.checked)}
                className="w-4 h-4 accent-[var(--color-lime)]"
              />
              <span className="text-[var(--color-muted)]">Blur size in UI</span>
            </label>
          </div>
        </div>

        {/* SUBMIT */}
        <div className="pt-4 border-t border-[var(--color-line)]">
          {!isConnected ? (
            <p className="text-center text-[var(--color-muted)] font-mono text-sm">Connect wallet to continue</p>
          ) : step === 'form' ? (
            <button
              onClick={handleApprove}
              disabled={!amountMaker || !terms}
              className="w-full bg-[var(--color-lime)] text-black py-3 font-bold font-mono hover:brightness-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              1. APPROVE {amountMaker || '0'} {TOKENS.find((t) => t.value === tokenMaker)?.label}
            </button>
          ) : step === 'approving' ? (
            <div className="space-y-3">
              <div className="w-full bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-muted)] py-3 font-mono text-center text-sm">
                {approveConfirmed ? '✓ Approved' : 'Approving…'}
              </div>
              {approveConfirmed && (
                <button
                  onClick={handleCreate}
                  className="w-full bg-[var(--color-lime)] text-black py-3 font-bold font-mono hover:brightness-90 transition-all cursor-pointer"
                >
                  2. CREATE PACT
                </button>
              )}
            </div>
          ) : (
            <div className="w-full bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-muted)] py-3 font-mono text-center text-sm">
              Creating pact…
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
