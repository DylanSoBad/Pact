'use client'

export interface PactStateMachineProps {
  status: number
}

const STEPS = [
  { s: 0, label: 'Offered', desc: 'Awaiting acceptance' },
  { s: 1, label: 'Active', desc: 'Collateral locked' },
  { s: 2, label: 'Proof In', desc: 'Delivery anchored' },
  { s: 3, label: 'Disputed', desc: 'Bonded review' },
  { s: 4, label: 'Settled', desc: 'Funds released' },
]

export default function PactStateMachine({ status }: PactStateMachineProps) {
  const isTerminal = status >= 4 && status <= 6
  const terminalLabel = status === 4 ? 'Settled & Cleared' : status === 5 ? 'Cancelled by Maker' : 'Expired & Refunded'
  const isDisputed = status === 3

  return (
    <section aria-label="Pact Lifecycle Progress" className="mb-6 border border-outline-border bg-[#0c0f12] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-outline-hairline">
        <span className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted">
          Agreement Lifecycle Stage
        </span>
        {isTerminal ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-emerald-500/40 bg-emerald-950/30 text-[10px] font-label-caps uppercase text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {terminalLabel}
          </span>
        ) : isDisputed ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-amber-500/40 bg-amber-950/30 text-[10px] font-label-caps uppercase text-amber-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 live-dot" />
            Dispute Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-primary-fixed/40 bg-primary-fixed/10 text-[10px] font-label-caps uppercase text-primary-fixed font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed live-dot" />
            Live State
          </span>
        )}
      </div>

      {/* Progress Track */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-code-hash">
        {STEPS.map((step) => {
          const isCurrent = status === step.s
          const isPast = status > step.s && !isTerminal
          const isCompletedSettled = status === 4 && step.s === 4

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
              key={step.s}
              className={`p-2.5 sm:p-3 border transition-colors flex flex-col justify-between min-h-[70px] ${containerStyle}`}
            >
              <div className="flex items-center justify-between">
                <span className={`w-4 h-4 flex items-center justify-center text-[10px] ${indicatorColor}`}>
                  {isPast || isCompletedSettled ? '✓' : step.s + 1}
                </span>
                <span className="text-[9px] font-label-caps uppercase tracking-wider text-text-dim">
                  Stage 0{step.s}
                </span>
              </div>
              <div className="mt-2">
                <span className={`block font-headline-mono text-[12px] uppercase tracking-wider ${titleColor}`}>
                  {step.label}
                </span>
                <span className="block text-[10px] text-text-muted mt-0.5 truncate">
                  {step.desc}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
