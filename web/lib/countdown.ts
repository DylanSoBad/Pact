/**
 * Unified Countdown & Deadline Urgency Utilities for PACT
 *
 * 4-Tier Standard:
 * - AMPLE (> 7 days): Emerald Green (#10b981) - Calm, ample time
 * - WARNING (1 to 7 days): Yellow/Amber (#facc15) - Active attention required
 * - URGENT (< 24 hours): Bright Orange (#fb923c) - Closing soon, urgent action
 * - EXPIRED (<= 0): Rose Red (#f43f5e) - Deadline elapsed, settlement due
 */

export type DeadlineTier = 'AMPLE' | 'WARNING' | 'URGENT' | 'EXPIRED'

export interface DeadlineStatus {
  tier: DeadlineTier
  diffSeconds: number
  isExpired: boolean
  isUrgent: boolean
  isWarning: boolean
  isAmple: boolean
  /** Full human-readable string: e.g. "3d 4h 12m 30s" or "Expired" */
  fullFormatted: string
  /** Compact human-readable string for mobile: e.g. "3d 4h" or "5h 12m" */
  compactFormatted: string
  /** Text color class */
  textColor: string
  /** Badge background + border + text classes */
  badgeStyle: string
  /** Ambient card/row highlight border classes when close to deadline */
  cardHighlightStyle: string
  /** Accessibility announcement */
  ariaLabel: string
}

const SECONDS_PER_DAY = 86400
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60
const SEVEN_DAYS_SECONDS = 7 * SECONDS_PER_DAY

export function getDeadlineStatus(
  deadlineTs: bigint | number,
  currentNowTs?: number
): DeadlineStatus {
  const deadline = Number(deadlineTs)
  const now = currentNowTs ?? Math.floor(Date.now() / 1000)
  const diff = deadline - now

  if (diff <= 0) {
    return {
      tier: 'EXPIRED',
      diffSeconds: diff,
      isExpired: true,
      isUrgent: false,
      isWarning: false,
      isAmple: false,
      fullFormatted: 'EXPIRED / SETTLEMENT DUE',
      compactFormatted: 'EXPIRED',
      textColor: 'text-rose-400',
      badgeStyle: 'text-rose-400 border border-rose-500/40 bg-rose-950/30 font-bold',
      cardHighlightStyle: 'border-rose-500/40 bg-rose-950/10',
      ariaLabel: 'Deadline has expired. Settlement is now due.',
    }
  }

  const days = Math.floor(diff / SECONDS_PER_DAY)
  const hours = Math.floor((diff % SECONDS_PER_DAY) / SECONDS_PER_HOUR)
  const minutes = Math.floor((diff % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = diff % SECONDS_PER_MINUTE

  let tier: DeadlineTier
  let textColor: string
  let badgeStyle: string
  let cardHighlightStyle: string
  let ariaLabel: string

  if (diff > SEVEN_DAYS_SECONDS) {
    tier = 'AMPLE'
    textColor = 'text-emerald-400'
    badgeStyle = 'text-emerald-400 border border-emerald-500/30 bg-emerald-950/20'
    cardHighlightStyle = 'border-outline-hairline/60 bg-transparent'
    ariaLabel = `Deadline in ${days} days. Ample time remaining.`
  } else if (diff >= SECONDS_PER_DAY) {
    tier = 'WARNING'
    textColor = 'text-amber-300'
    badgeStyle = 'text-amber-300 border border-amber-400/40 bg-amber-950/25 font-medium'
    cardHighlightStyle = 'border-amber-500/20 bg-amber-950/5'
    ariaLabel = `Deadline in ${days} days and ${hours} hours. Active attention required.`
  } else {
    tier = 'URGENT'
    textColor = 'text-orange-400'
    badgeStyle = 'text-orange-400 border border-orange-500/50 bg-orange-950/35 font-bold shadow-[0_0_8px_rgba(251,146,60,0.15)]'
    cardHighlightStyle = 'border-orange-500/40 bg-orange-950/10 ring-1 ring-orange-500/20'
    ariaLabel = `Urgent: Deadline closing in ${hours} hours and ${minutes} minutes.`
  }

  // Full format: e.g. "3d 4h 15m 20s" or "4h 12m 30s" or "12m 30s" or "8d"
  let fullFormatted = ''
  if (days > 0) fullFormatted += `${days}d `
  if (hours > 0) fullFormatted += `${hours}h `
  if (minutes > 0) fullFormatted += `${minutes}m `
  if (seconds > 0 || fullFormatted === '') fullFormatted += `${seconds}s`

  // Compact format for mobile & table rows: e.g. "3d 4h", "5h 12m", "45s"
  let compactFormatted = ''
  if (days > 0) {
    compactFormatted = hours > 0 ? `${days}d ${hours}h` : `${days}d`
  } else if (hours > 0) {
    compactFormatted = `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    compactFormatted = `${minutes}m ${seconds}s`
  } else {
    compactFormatted = `${seconds}s`
  }

  return {
    tier,
    diffSeconds: diff,
    isExpired: false,
    isUrgent: tier === 'URGENT',
    isWarning: tier === 'WARNING',
    isAmple: tier === 'AMPLE',
    fullFormatted: fullFormatted.trim(),
    compactFormatted: compactFormatted.trim(),
    textColor,
    badgeStyle,
    cardHighlightStyle,
    ariaLabel,
  }
}
