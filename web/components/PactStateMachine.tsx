'use client'

const STEPS = [
  { s: 0, label: 'Offered' },
  { s: 1, label: 'Active' },
  { s: 2, label: 'Proof in' },
  { s: 3, label: 'Disputed' },
  { s: 4, label: 'Settled' },
]

export default function PactStateMachine({ status }: { status: number }) {
  const isTerminal = status >= 4 && status <= 6
  const terminalLabel = status === 4 ? 'Settled' : status === 5 ? 'Cancelled' : 'Expired'

  return (
    <div className="mb-8">
      {/* Progress bar */}
      <div className="relative flex justify-between items-center mb-4">
        {/* Track Line */}
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-zinc-800 -translate-y-1/2 z-0">
          <div
            className="h-full transition-all duration-500 bg-[#c8f542]"
            style={{ width: isTerminal ? '0%' : `${Math.min((status / 4) * 100, 100)}%` }}
          />
        </div>
        {/* Labels */}
        <div className="relative z-10 w-full flex justify-between">
          {STEPS.map(step => {
            const active = status === step.s
            const done = status > step.s && !isTerminal
            return (
              <span key={step.s} className={`text-[10px] uppercase tracking-widest ${
                active ? 'text-[#c8f542] font-bold' : done ? 'text-zinc-500' : 'text-zinc-700'
              }`}>
                {active && !isTerminal && <span className="inline-block w-1.5 h-1.5 bg-[#c8f542] mr-1" />}
                {step.label}
              </span>
            )
          })}
        </div>
      </div>

      {isTerminal && (
        <div className="flex items-center gap-2 text-[12px] font-mono">
          <span className="text-zinc-600 uppercase">Outcome:</span>
          <span className="text-[#c8f542] font-bold">{terminalLabel}</span>
        </div>
      )}
    </div>
  )
}
