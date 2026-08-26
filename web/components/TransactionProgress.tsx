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
  const title = stage === 'awaiting-signature' ? 'Confirm in wallet'
    : stage === 'confirming' ? 'Waiting for on-chain confirmation'
      : isSuccess ? 'Transaction confirmed' : 'Transaction needs attention'

  return (
    <div role={isError ? 'alert' : 'status'} aria-live="polite" className={`mt-4 border p-4 ${isError ? 'border-status-error/60 bg-status-error/10' : isSuccess ? 'border-primary-fixed/50 bg-primary-fixed/10' : 'border-status-warning/50 bg-status-warning/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${isError ? 'text-status-error' : isSuccess ? 'text-primary-fixed' : 'text-[#f7d36b]'}`}>{title}</p>
          <p className="mt-1 text-[12px] leading-5 text-text-muted">{isError ? error : label}</p>
        </div>
        {!isSuccess && !isError && <span className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent text-[#f7d36b]" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {hash && <a href={`https://testnet.arcscan.app/tx/${hash}`} target="_blank" rel="noreferrer" className="text-[11px] text-primary-fixed underline">Track on ArcScan ↗</a>}
        {isError && onDismiss && <button type="button" onClick={onDismiss} className="text-[11px] text-text-muted underline">Dismiss and retry</button>}
      </div>
    </div>
  )
}
