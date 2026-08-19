'use client'

const STEPS = [
  { s: 0, label: 'Open' },
  { s: 1, label: 'Funded' },
  { s: 2, label: 'Active' },
  { s: 3, label: 'Proof in' },
  { s: 4, label: 'Cleared' },
]

export default function PactStateMachine({ status }: { status: number }) {
  const isTerminal = status >= 5 && status <= 7
  const isDisputed = status === 8
  const terminalLabel = status === 5 ? 'Slashed' : status === 6 ? 'Expired' : status === 7 ? 'Cancelled' : ''

  return (
    <div className="mb-8">
      {/* Progress bar */}
      <div className="relative mb-6">
        {/* Track */}
        <div className="h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isDisputed ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
            }`}
            style={{ width: isTerminal ? '0%' : isDisputed ? '75%' : `${Math.min((status / 4) * 100, 100)}%` }}
          />
        </div>
        {/* Labels */}
        <div className="flex justify-between mt-2.5">
          {STEPS.map(step => {
            const active = status === step.s
            const done = status > step.s && !isTerminal && !isDisputed
            return (
              <span key={step.s} className={`text-[11px] ${
                active ? 'text-emerald-400 font-medium' : done ? 'text-zinc-400' : 'text-zinc-700'
              }`}>
                {step.label}
              </span>
            )
          })}
        </div>
      </div>

      {isDisputed && (
        <div className="flex items-center gap-2 text-[13px] bg-amber-500/[0.08] border border-amber-500/20 p-2.5 rounded-lg text-amber-300">
          <span>⚖️</span>
          <span className="font-semibold">Under Decentralized Arbitration:</span>
          <span className="text-zinc-400 text-[12px]">2-of-3 Multi-Sig Lock Active</span>
        </div>
      )}

      {isTerminal && (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-zinc-500">Outcome:</span>
          <span className={`font-medium ${status === 5 ? 'text-rose-400' : 'text-zinc-400'}`}>
            {terminalLabel}
          </span>
        </div>
      )}
    </div>
  )
}
