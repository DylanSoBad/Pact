/**
 * PACT Privacy-Preserving Notification Engine (ADR-0004)
 * 
 * Provides deterministic deduplication, deadline evaluations,
 * and preference management without leaking private terms or analytics.
 */

export type NotificationCategory = 'deadlines' | 'proofs' | 'disputes' | 'withdrawals'
export type NotificationPriority = 'critical' | 'urgent' | 'info' | 'success'

export interface PactNotification {
  id: string
  pactId: number
  category: NotificationCategory
  priority: NotificationPriority
  title: string
  message: string
  deepLink: string
  timestamp: number
  read: boolean
  expiresAt?: number
  actionLabel?: string
  metadata?: {
    deadlineTs?: number
    amount?: string
    tokenSymbol?: string
    role?: 'MAKER' | 'TAKER' | 'ARBITER'
  }
}

export interface NotificationPreferences {
  enabledCategories: {
    deadlines: boolean
    proofs: boolean
    disputes: boolean
    withdrawals: boolean
  }
  urgencyThresholdHours: number // e.g. 24h
  soundEnabled: boolean
  browserPushOptIn: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabledCategories: {
    deadlines: true,
    proofs: true,
    disputes: true,
    withdrawals: true,
  },
  urgencyThresholdHours: 24,
  soundEnabled: false,
  browserPushOptIn: false,
}

const PREFS_STORAGE_KEY_PREFIX = 'pact:notifications:prefs:'
const READ_STORAGE_KEY_PREFIX = 'pact:notifications:read:'

/**
 * Generates an idempotent, deterministic notification ID to prevent duplicates.
 */
export function generateNotificationId(pactId: number, eventType: string, epochOrKey: number | string): string {
  return `pact-${pactId}-${eventType}-${epochOrKey}`
}

/**
 * Deduplicates a list of notifications by ID preserving the latest occurrence.
 */
export function deduplicateNotifications(notifications: PactNotification[]): PactNotification[] {
  const seen = new Map<string, PactNotification>()
  for (const item of notifications) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item)
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.timestamp - a.timestamp)
}

export interface PactDataForNotification {
  id: number
  maker: string
  taker: string
  arbiter: string
  status: number // 0=Offered, 1=Active, 2=ProofSubmitted, 3=Disputed, 4=Settled, 5=Cancelled, 6=Expired
  offerExpiry: bigint | number | string
  performanceDeadline: bigint | number | string
  disputeDeadline: bigint | number | string
  amountMaker?: bigint | string
  amountTaker?: bigint | string
  tokenMaker?: string
  tokenTaker?: string
  dispute?: {
    opener: string
    responseDeadline: bigint | number | string
    arbiterDeadline: bigint | number | string
  } | null
}

export interface UserCreditsForNotification {
  token: string
  symbol: string
  amount: bigint
}

/**
 * Evaluates active pacts against the current clock to generate privacy-safe deadline and status alerts.
 */
export function evaluateDeadlineAlerts(
  pacts: PactDataForNotification[],
  currentTimestampSec: number,
  userAddress: string | undefined,
  preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
  userCredits: UserCreditsForNotification[] = []
): PactNotification[] {
  if (!userAddress) return []

  const normalizedUser = userAddress.toLowerCase()
  const alerts: PactNotification[] = []
  const thresholdSec = preferences.urgencyThresholdHours * 3600

  // 1. Check Withdrawable Credits
  if (preferences.enabledCategories.withdrawals && userCredits.length > 0) {
    for (const credit of userCredits) {
      if (credit.amount > 0n) {
        alerts.push({
          id: `withdraw-${credit.token}-${normalizedUser}`,
          pactId: 0,
          category: 'withdrawals',
          priority: 'success',
          title: 'Claimable Pull Credits Available',
          message: `You have withdrawable balance ready for withdrawal to your wallet.`,
          deepLink: '/me',
          timestamp: currentTimestampSec * 1000,
          read: false,
          actionLabel: 'Withdraw Credits',
          metadata: {
            tokenSymbol: credit.symbol,
          },
        })
      }
    }
  }

  // 2. Evaluate Each Pact
  for (const pact of pacts) {
    const isMaker = pact.maker.toLowerCase() === normalizedUser
    const isTaker = pact.taker.toLowerCase() === normalizedUser
    const isArbiter = pact.arbiter.toLowerCase() === normalizedUser

    if (!isMaker && !isTaker && !isArbiter) continue

    const offerExpiry = Number(pact.offerExpiry)
    const performanceDeadline = Number(pact.performanceDeadline)
    const disputeDeadline = Number(pact.disputeDeadline)

    // A. Offer Expiry Alert (Status = Offered)
    if (pact.status === 0 && preferences.enabledCategories.deadlines) {
      const remainingSec = offerExpiry - currentTimestampSec
      if (remainingSec > 0 && remainingSec <= thresholdSec) {
        const hoursLeft = Math.max(1, Math.ceil(remainingSec / 3600))
        alerts.push({
          id: generateNotificationId(pact.id, 'offer-expiring', Math.floor(offerExpiry / 3600)),
          pactId: pact.id,
          category: 'deadlines',
          priority: remainingSec <= 7200 ? 'urgent' : 'info',
          title: `Pact #${String(pact.id).padStart(4, '0')} Offer Expiring Soon`,
          message: isTaker 
            ? `Action required: You have ~${hoursLeft}h to review and accept this deal offer before expiration.`
            : `Your created offer will expire in ~${hoursLeft}h if not accepted.`,
          deepLink: `/p/${pact.id}`,
          timestamp: currentTimestampSec * 1000,
          read: false,
          actionLabel: isTaker ? 'Review Offer' : 'View Pact',
          metadata: {
            deadlineTs: offerExpiry,
            role: isTaker ? 'TAKER' : 'MAKER',
          },
        })
      }
    }

    // B. Performance Deadline Alert (Status = Active)
    if (pact.status === 1 && preferences.enabledCategories.deadlines) {
      const remainingSec = performanceDeadline - currentTimestampSec
      if (remainingSec > 0 && remainingSec <= thresholdSec) {
        const hoursLeft = Math.max(1, Math.ceil(remainingSec / 3600))
        alerts.push({
          id: generateNotificationId(pact.id, 'performance-urgent', Math.floor(performanceDeadline / 3600)),
          pactId: pact.id,
          category: 'deadlines',
          priority: remainingSec <= 86400 ? 'urgent' : 'info',
          title: `Pact #${String(pact.id).padStart(4, '0')} Delivery Deadline Approaching`,
          message: isTaker
            ? `Urgent: Submit your work or delivery proof hash within ~${hoursLeft}h to protect your payout.`
            : `Fulfillment cutoff in ~${hoursLeft}h. Awaiting counterparty proof submission.`,
          deepLink: `/p/${pact.id}`,
          timestamp: currentTimestampSec * 1000,
          read: false,
          actionLabel: isTaker ? 'Submit Proof' : 'View Pact',
          metadata: {
            deadlineTs: performanceDeadline,
            role: isTaker ? 'TAKER' : 'MAKER',
          },
        })
      }
    }

    // C. Proof Submitted Alert (Status = ProofSubmitted)
    if (pact.status === 2 && preferences.enabledCategories.proofs) {
      if (isMaker) {
        alerts.push({
          id: generateNotificationId(pact.id, 'proof-submitted', 'active'),
          pactId: pact.id,
          category: 'proofs',
          priority: 'urgent',
          title: `Pact #${String(pact.id).padStart(4, '0')} Delivery Proof Submitted`,
          message: `Counterparty has submitted fulfillment proof. Please review deliverables and release escrow.`,
          deepLink: `/p/${pact.id}`,
          timestamp: currentTimestampSec * 1000,
          read: false,
          actionLabel: 'Review & Release',
          metadata: {
            deadlineTs: disputeDeadline,
            role: 'MAKER',
          },
        })
      }
    }

    // D. Dispute Alerts (Status = Disputed)
    if (pact.status === 3 && preferences.enabledCategories.disputes && pact.dispute) {
      const responseDeadline = Number(pact.dispute.responseDeadline)
      const arbiterDeadline = Number(pact.dispute.arbiterDeadline)
      const isOpener = pact.dispute.opener.toLowerCase() === normalizedUser
      const isRespondent = (isMaker || isTaker) && !isOpener

      // Case 1: Dispute opened, waiting for respondent
      if (arbiterDeadline === 0) {
        const remainingResponseSec = responseDeadline - currentTimestampSec
        if (remainingResponseSec > 0) {
          const hoursLeft = Math.max(1, Math.ceil(remainingResponseSec / 3600))
          if (isRespondent) {
            alerts.push({
              id: generateNotificationId(pact.id, 'dispute-response-required', Math.floor(responseDeadline / 3600)),
              pactId: pact.id,
              category: 'disputes',
              priority: 'critical',
              title: `🚨 Dispute Opened on Pact #${String(pact.id).padStart(4, '0')}`,
              message: `Action Required: Counterparty initiated a dispute. Post your counter-bond within ~${hoursLeft}h or lose by default.`,
              deepLink: `/p/${pact.id}`,
              timestamp: currentTimestampSec * 1000,
              read: false,
              actionLabel: 'Respond to Dispute',
              metadata: {
                deadlineTs: responseDeadline,
                role: isMaker ? 'MAKER' : 'TAKER',
              },
            })
          }
        }
      } else {
        // Case 2: Both parties bonded, awaiting Arbiter ruling
        const remainingArbiterSec = arbiterDeadline - currentTimestampSec
        if (remainingArbiterSec > 0 && isArbiter) {
          const daysLeft = Math.max(1, Math.ceil(remainingArbiterSec / 86400))
          alerts.push({
            id: generateNotificationId(pact.id, 'arbiter-ruling-pending', Math.floor(arbiterDeadline / 86400)),
            pactId: pact.id,
            category: 'disputes',
            priority: 'urgent',
            title: `Arbiter Action Required: Pact #${String(pact.id).padStart(4, '0')}`,
            message: `Both parties have bonded. Please review evidence and issue ruling within ${daysLeft} days.`,
            deepLink: `/p/${pact.id}`,
            timestamp: currentTimestampSec * 1000,
            read: false,
            actionLabel: 'Rule Dispute',
            metadata: {
              deadlineTs: arbiterDeadline,
              role: 'ARBITER',
            },
          })
        }
      }
    }
  }

  return deduplicateNotifications(alerts)
}

/**
 * Storage Helpers
 */
export function loadNotificationPreferences(userAddress: string | undefined): NotificationPreferences {
  if (!userAddress || typeof window === 'undefined') return DEFAULT_NOTIFICATION_PREFERENCES
  try {
    const raw = localStorage.getItem(`${PREFS_STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`)
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }
}

export function saveNotificationPreferences(userAddress: string, prefs: NotificationPreferences): void {
  if (!userAddress || typeof window === 'undefined') return
  try {
    localStorage.setItem(`${PREFS_STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`, JSON.stringify(prefs))
  } catch {}
}

export function loadReadNotificationIds(userAddress: string | undefined): Set<string> {
  if (!userAddress || typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(`${READ_STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

export function saveReadNotificationIds(userAddress: string, readIds: Set<string>): void {
  if (!userAddress || typeof window === 'undefined') return
  try {
    localStorage.setItem(`${READ_STORAGE_KEY_PREFIX}${userAddress.toLowerCase()}`, JSON.stringify(Array.from(readIds)))
  } catch {}
}
