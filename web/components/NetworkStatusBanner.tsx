'use client'

interface NetworkStatusBannerProps {
  onRetry?: () => void
  isRetrying?: boolean
}

export default function NetworkStatusBanner({ onRetry, isRetrying }: NetworkStatusBannerProps) {
  return (
    <div 
      role="alert" 
      aria-live="polite"
      className="w-full bg-[#1e0d10] border border-status-error/40 text-rose-300 px-4 py-2.5 rounded-DEFAULT mb-3 flex items-center justify-between gap-3 text-xs font-code-hash shadow-lg animate-enter"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-status-error animate-ping shrink-0" />
        <span className="material-symbols-outlined text-[16px] text-status-error">cloud_off</span>
        <span>
          <strong className="text-status-error uppercase">NODE TELEMETRY INTERRUPTED:</strong> Unable to synchronize with Arc Testnet RPC node.
        </span>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="px-3 py-1 bg-status-error/20 hover:bg-status-error text-status-error hover:text-black border border-status-error/50 rounded-DEFAULT font-label-caps uppercase text-[11px] transition-colors shrink-0 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-status-error"
        >
          {isRetrying ? 'RETRYING...' : 'RETRY SYNC'}
        </button>
      )}
    </div>
  )
}
