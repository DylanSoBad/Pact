'use client'

import { useCurrentTime } from '../hooks/useCurrentTime'
import { getDeadlineStatus } from '../lib/countdown'

interface CountdownProps {
  deadlineTs: bigint | number
  compact?: boolean
  showIcon?: boolean
  showLabel?: boolean
  className?: string
}

/**
 * Standardized 4-Tier Countdown Component
 *
 * Visual tiers:
 * - > 7 days: Emerald Green (text-emerald-400)
 * - 1 to 7 days: Amber Yellow (text-amber-300)
 * - < 24 hours: Urgent Orange (text-orange-400 with pulsing indicator)
 * - Expired: Rose Red (text-rose-400)
 */
export default function Countdown({
  deadlineTs,
  compact = false,
  showIcon = true,
  showLabel = true,
  className = '',
}: CountdownProps) {
  const currentTime = useCurrentTime()
  const status = getDeadlineStatus(deadlineTs, currentTime)

  return (
    <div
      className={`inline-flex items-center gap-1.5 font-code-hash text-[12px] ${className}`}
      aria-label={status.ariaLabel}
      title={status.ariaLabel}
    >
      {showLabel && (
        <span className="text-text-muted text-[11px] font-label-caps uppercase tracking-wider">
          {status.isExpired ? 'Status:' : 'Time Left:'}
        </span>
      )}

      <div className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold tabular-nums transition-colors ${status.badgeStyle}`}>
        {showIcon && (
          <span className="text-[12px] leading-none" aria-hidden="true">
            {status.isExpired ? '⌛' : status.isUrgent ? '🔥' : '⏱'}
          </span>
        )}
        <span>
          {compact ? status.compactFormatted : status.fullFormatted}
        </span>
      </div>
    </div>
  )
}
