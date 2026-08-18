'use client'

const MAIN_FLOW = [
  { status: 0, label: '0. Open', desc: 'Maker deposit locked' },
  { status: 1, label: '1. Funded', desc: 'Taker bond deposited' },
  { status: 2, label: '2. Active', desc: 'Escrow live' },
  { status: 3, label: '3. Proof In', desc: 'Proof submitted' },
  { status: 4, label: '4. Cleared', desc: 'Settled & released' },
]

const TERMINAL_BRANCHES = [
  { status: 5, label: 'Slashed', desc: 'Dispute resolved / bond forfeited' },
  { status: 6, label: 'Expired', desc: 'Timeout refund triggered' },
  { status: 7, label: 'Cancelled', desc: 'Maker cancelled before funding' },
]

export default function PactStateMachine({ status }: { status: number }) {
  const isTerminalBranch = status >= 5

  return (
    <div className="bg-[#111215] border border-[#1e1f25] rounded-lg p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1c1d22]">
        <span className="text-[11px] font-mono font-semibold text-zinc-300 uppercase tracking-wider">
          Escrow State Machine
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          Status Code: <strong className="text-zinc-300 font-medium">#{status}</strong>
        </span>
      </div>

      {/* Horizontal Stepper (Scrollable on mobile) */}
      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex items-center min-w-[580px] justify-between relative">
          {/* Connector Line behind steps */}
          <div className="absolute top-3.5 left-6 right-6 h-[2px] bg-[#1e2026] -z-0" />

          {MAIN_FLOW.map((step, idx) => {
            const isCurrent = status === step.status
            const isPast = status > step.status && !isTerminalBranch
            const isFuture = status < step.status || isTerminalBranch

            return (
              <div key={step.status} className="flex flex-col items-center relative z-10 text-center flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all border ${
                    isCurrent
                      ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.3)] ring-2 ring-emerald-500/20'
                      : isPast
                      ? 'bg-[#181a1f] text-emerald-400 border-emerald-500/40'
                      : 'bg-[#121316] text-zinc-600 border-[#22242b]'
                  }`}
                >
                  {isPast ? '✓' : idx}
                </div>
                <span className={`text-[11px] font-mono font-medium mt-2 whitespace-nowrap ${
                  isCurrent ? 'text-emerald-400 font-bold' : isPast ? 'text-zinc-300' : 'text-zinc-500'
                }`}>
                  {step.label}
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 hidden sm:block max-w-[90px] leading-tight">
                  {step.desc}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Terminal Alternative Branch Indicator */}
      {isTerminalBranch && (
        <div className="mt-3 pt-3 border-t border-[#1c1d22] flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-400">Terminal Outcome:</span>
          <span className={`px-2.5 py-0.5 rounded font-semibold border ${
            status === 5
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              : status === 6
              ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}>
            {status === 5 ? 'SLASHED / DEFAULT' : status === 6 ? 'EXPIRED ON TIMEOUT' : 'CANCELLED BY MAKER'}
          </span>
        </div>
      )}
    </div>
  )
}
