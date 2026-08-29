'use client'

import { useCurrentTime } from '../hooks/useCurrentTime'
import ProtocolTerm from './ProtocolTerm'

export interface PactStateMachineProps {
  status: number
  offerExpiry?: bigint
  disputeDeadline?: bigint
}

interface StepItem {
  id: number
  name: string
  protocolState: string
  desc: string
  isDisputeStep?: boolean
}

const NORMAL_STEPS: StepItem[] = [
  { id: 0, name: 'Offered', protocolState: 'OFFERED (0)', desc: 'Maker funded · Awaiting counterparty acceptance' },
  { id: 1, name: 'Active', protocolState: 'ACTIVE (1)', desc: 'Both parties locked · Obligation in progress' },
  { id: 2, name: 'Proof In', protocolState: 'PROOF_SUBMITTED (2)', desc: 'Delivery anchored · Maker review window open' },
  { id: 4, name: 'Settled', protocolState: 'SETTLED (4)', desc: 'Escrow released · Agreement completed' },
]

export default function PactStateMachine({ status, offerExpiry, disputeDeadline }: PactStateMachineProps) {
  const currentTime = useCurrentTime()
  const now = BigInt(currentTime)
  const isTerminal = status >= 4 && status <= 6
  const terminalLabel = status === 4 ? 'Settled & Cleared' : status === 5 ? 'Cancelled by Maker' : 'Expired & Refunded'
  const isDisputed = status === 3
  const isExpiredOffer = status === 0 && offerExpiry !== undefined && now > offerExpiry
  const isExpiredDisputeWindow = (status === 1 || status === 2) && disputeDeadline !== undefined && now > disputeDeadline

  return (
    <section aria-label="Pact Lifecycle Progress" className="mb-6 border border-outline-border bg-[#0c0f12] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-outline-hairline">
        <div className="flex items-center gap-2">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
            Agreement Lifecycle
          </span>
          <span className="text-[11px] text-text-dim">·</span>
          <span className="text-[11px] font-code-hash text-text-muted">
            {isDisputed ? '⚠️ Contested Path (Dispute Active)' : 'Standard Escrow Settlement Flow'}
          </span>
        </div>

        <div>
          {isTerminal ? (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border text-[10px] font-label-caps uppercase font-bold ${
              status === 4
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400'
                : status === 5
                ? 'border-zinc-700/40 bg-zinc-900/30 text-zinc-400'
                : 'border-rose-500/40 bg-rose-950/30 text-rose-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status === 4 ? 'bg-emerald-400' : status === 5 ? 'bg-zinc-400' : 'bg-rose-400'}`} />
              {terminalLabel}
            </span>
          ) : isExpiredOffer ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border border-rose-500/40 bg-rose-950/30 text-[10px] font-label-caps uppercase text-rose-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 live-dot" />
              Offer Window Elapsed (Claim Refund)
            </span>
          ) : isExpiredDisputeWindow ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border border-amber-500/40 bg-amber-950/30 text-[10px] font-label-caps uppercase text-amber-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 live-dot" />
              Review Window Elapsed (Finalize Settlement)
            </span>
          ) : isDisputed ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border border-amber-500/40 bg-amber-950/30 text-[10px] font-label-caps uppercase text-amber-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 live-dot" />
              Disputed (Bonded Review)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border border-primary-fixed/40 bg-primary-fixed/10 text-[10px] font-label-caps uppercase text-primary-fixed font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed live-dot" />
              Active Progression
            </span>
          )}
        </div>
      </div>

      {/* If Disputed, show dispute-specific flow */}
      {isDisputed ? (
        <div className="space-y-3 font-code-hash">
          <div className="p-3 bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px] font-body-sans flex items-center gap-2">
            <span>⚠️</span>
            <span>
              <strong>Active Dispute Branch:</strong> A dispute was filed. Both parties provided <ProtocolTerm term="DISPUTE_BOND">dispute bonds</ProtocolTerm>. The designated <ProtocolTerm term="ARBITER">Arbiter</ProtocolTerm> evaluates written terms against proof to submit a final binding ruling.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-3 border border-outline-border bg-[#0a0d10]">
              <span className="block text-[10px] font-label-caps uppercase text-text-dim">Step 1 · Challenge</span>
              <span className="block font-headline-mono text-[12px] font-bold text-white mt-1">Dispute Opened</span>
              <span className="block text-[10px] text-text-muted mt-0.5">Dispute bond staked & review window locked</span>
            </div>

            <div className="p-3 border border-amber-500/50 bg-amber-950/30">
              <span className="block text-[10px] font-label-caps uppercase text-amber-400">Step 2 · Mediation</span>
              <span className="block font-headline-mono text-[12px] font-bold text-amber-300 mt-1">Arbiter Review</span>
              <span className="block text-[10px] text-amber-200/80 mt-0.5">Arbiter reviews proof vs written terms</span>
            </div>

            <div className="p-3 border border-outline-hairline bg-[#07080a]">
              <span className="block text-[10px] font-label-caps uppercase text-text-dim">Step 3 · Settlement</span>
              <span className="block font-headline-mono text-[12px] font-bold text-text-dim mt-1">Ruling Execution</span>
              <span className="block text-[10px] text-text-muted mt-0.5">Arbiter awards escrow or timeout refund applies</span>
            </div>
          </div>
        </div>
      ) : (
        /* Normal 4-step linear track */
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 font-code-hash">
          {NORMAL_STEPS.map((step, idx) => {
            const isCurrent = status === step.id
            const isPast = status > step.id && !isTerminal
            const isCompletedSettled = status === 4 && step.id === 4

            let containerStyle = 'border-outline-hairline bg-[#07080a] text-text-dim'
            let indicatorColor = 'bg-zinc-800 text-zinc-600'
            let titleColor = 'text-text-dim'

            if (isCurrent && !isTerminal) {
              containerStyle = 'border-primary-fixed bg-primary-fixed/[0.08]'
              indicatorColor = 'bg-primary-fixed text-black font-bold'
              titleColor = 'text-primary-fixed font-bold'
            } else if (isCompletedSettled) {
              containerStyle = 'border-emerald-500/40 bg-emerald-950/20'
              indicatorColor = 'bg-emerald-400 text-black font-bold'
              titleColor = 'text-emerald-400 font-bold'
            } else if (isPast) {
              containerStyle = 'border-outline-border bg-[#0a0d10]'
              indicatorColor = 'bg-[#181e25] text-primary-fixed font-bold'
              titleColor = 'text-white'
            }

            return (
              <div
                key={step.id}
                className={`p-3 border transition-colors flex flex-col justify-between min-h-[85px] ${containerStyle}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`w-5 h-5 flex items-center justify-center text-[10px] ${indicatorColor}`}>
                    {isPast || isCompletedSettled ? '✓' : idx + 1}
                  </span>
                  <span className="text-[9px] font-label-caps uppercase tracking-wider text-text-dim">
                    {step.protocolState}
                  </span>
                </div>
                <div className="mt-2">
                  <span className={`block font-headline-mono text-[12px] uppercase tracking-wider ${titleColor}`}>
                    {step.name}
                  </span>
                  <span className="block text-[10px] text-text-muted mt-1 leading-relaxed">
                    {step.desc}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
