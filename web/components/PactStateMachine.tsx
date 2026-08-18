'use client'

const STEPS = [
  { status: 0, label: 'Open' },
  { status: 1, label: 'Funded' },
  { status: 2, label: 'Active' },
  { status: 3, label: 'Proof In' },
  { status: 4, label: 'Cleared' },
]

const TERMINAL = [
  { status: 5, label: 'Slashed', color: 'text-rose-400 bg-rose-500/10 border-rose-500/25' },
  { status: 6, label: 'Expired', color: 'text-zinc-400 bg-zinc-800/60 border-zinc-700/40' },
  { status: 7, label: 'Cancelled', color: 'text-zinc-400 bg-zinc-800/60 border-zinc-700/40' },
]

export default function PactStateMachine({ status }: { status: number }) {
  const isTerminal = status >= 5

  return (
    <div className="mb-6">
      {/* Horizontal stepper */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center gap-0 min-w-[420px]">
          {STEPS.map((step, idx) => {
            const isCurrent = status === step.status
            const isPast = status > step.status && !isTerminal

            return (
              <div key={step.status} className="flex items-center flex-1">
                {/* Step circle */}
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold border transition-all ${
                    isCurrent
                      ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.25)]'
                      : isPast
                      ? 'bg-zinc-800 text-emerald-400 border-zinc-700'
                      : 'bg-zinc-900 text-zinc-600 border-zinc-800'
                  }`}>
                    {isPast ? '✓' : idx}
                  </div>
                  <span className={`text-[10px] font-mono ${
                    isCurrent ? 'text-emerald-400 font-medium' : isPast ? 'text-zinc-400' : 'text-zinc-600'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {/* Connector line */}
                {idx < STEPS.length - 1 && (
                  <div className={`h-px flex-1 mx-1 ${isPast ? 'bg-emerald-500/30' : 'bg-zinc-800'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Terminal outcome badge */}
      {isTerminal && (
        <div className="mt-3 pt-3 border-t border-zinc-800/50 flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-500">Terminal outcome</span>
          {TERMINAL.filter(t => t.status === status).map(t => (
            <span key={t.status} className={`px-2.5 py-1 rounded font-medium border ${t.color}`}>
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
