'use client'

export type TransactionStage = 'idle' | 'awaiting-signature' | 'confirming' | 'success' | 'error'

export default function TransactionProgress({
  stage,
  label,
  hash,
  error,
  onDismiss,
}: {
  stage: TransactionStage
  label: string
  hash?: `0x${string}` | null
  error?: string
  onDismiss?: () => void
}) {
  if (stage === 'idle') return null

  const isError = stage === 'error'
  const isSuccess = stage === 'success'
  const isAwaiting = stage === 'awaiting-signature'
  const isConfirming = stage === 'confirming'

  const title = isAwaiting
    ? '1/2 · Confirm in Wallet'
    : isConfirming
    ? '2/2 · Confirming on Arc Testnet'
    : isSuccess
    ? '✓ Transaction Finalized'
    : 'Transaction Failed'

  const borderColor = isError
    ? 'border-status-error/60 bg-status-error/10'
    : isSuccess
    ? 'border-emerald-500/50 bg-emerald-950/20'
    : 'border-primary-fixed/40 bg-primary-fixed/[0.04]'

  const titleColor = isError
    ? 'text-status-error'
    : isSuccess
    ? 'text-emerald-400'
    : 'text-primary-fixed'

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live="polite"
      className={`mt-4 border p-4 font-code-hash text-[12px] animate-enter ${borderColor}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`font-headline-mono text-[12px] font-bold uppercase tracking-wider ${titleColor}`}>
              {title}
            </span>
          </div>
          <p className="font-body-sans text-[12px] leading-5 text-text-muted">
            {isError ? error : label}
          </p>
        </div>

        {(isAwaiting || isConfirming) && (
          <span className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-primary-fixed border-t-transparent" aria-hidden="true" />
        )}
      </div>

      {/* Action links */}
      <div className="mt-3 pt-2 border-t border-outline-hairline/50 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {hash ? (
          <a
            href={`https://testnet.arcscan.app/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary-fixed hover:underline flex items-center gap-1 font-bold"
          >
            <span>View on ArcScan Explorer ↗</span>
          </a>
        ) : (
          <span className="text-text-dim">Network: Arc Testnet (5042002)</span>
        )}

        {isError && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="px-2.5 py-1 border border-outline-border bg-[#12161b] text-text-muted hover:text-white font-label-caps uppercase text-[10px] transition-colors"
          >
            Dismiss & Safe Retry
          </button>
        )}
      </div>
    </div>
  )
}
