import { describe, it, expect } from 'vitest'
import {
  evaluateDeadlineAlerts,
  deduplicateNotifications,
  generateNotificationId,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type PactDataForNotification,
  type NotificationPreferences,
  type UserCreditsForNotification,
  type PactNotification,
} from '../lib/notifications'

const USER_ALICE = '0x1111111111111111111111111111111111111111'
const USER_BOB = '0x2222222222222222222222222222222222222222'
const USER_ARBITER = '0x3333333333333333333333333333333333333333'
const STRANGER = '0x9999999999999999999999999999999999999999'

describe('Notifications Engine (ADR-0004)', () => {
  const baseTimestamp = 1_700_000_000

  it('generates urgent offer expiration alert for Taker when within threshold', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 101,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 0, // Offered
        offerExpiry: baseTimestamp + 3600, // 1h remaining
        performanceDeadline: baseTimestamp + 86400 * 7,
        disputeDeadline: baseTimestamp + 86400 * 10,
      },
    ]

    const alerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_BOB)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].category).toBe('deadlines')
    expect(alerts[0].priority).toBe('urgent')
    expect(alerts[0].deepLink).toBe('/p/101')
    expect(alerts[0].title).toContain('Pact #0101 Offer Expiring Soon')
    expect(alerts[0].actionLabel).toBe('Review Offer')
  })

  it('generates performance deadline urgency alert for Taker when active and within 24h', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 102,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 1, // Active
        offerExpiry: baseTimestamp - 3600,
        performanceDeadline: baseTimestamp + 18000, // 5h remaining
        disputeDeadline: baseTimestamp + 86400 * 3,
      },
    ]

    const alerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_BOB)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].category).toBe('deadlines')
    expect(alerts[0].priority).toBe('urgent')
    expect(alerts[0].title).toContain('Delivery Deadline Approaching')
    expect(alerts[0].actionLabel).toBe('Submit Proof')
  })

  it('generates proof submitted notification for Maker to review escrow', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 103,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 2, // ProofSubmitted
        offerExpiry: baseTimestamp - 7200,
        performanceDeadline: baseTimestamp - 3600,
        disputeDeadline: baseTimestamp + 86400 * 3,
      },
    ]

    const alerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_ALICE)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].category).toBe('proofs')
    expect(alerts[0].actionLabel).toBe('Review & Release')
  })

  it('generates critical dispute response alert for Respondent within 72h window', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 104,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 3, // Disputed
        offerExpiry: baseTimestamp - 86400,
        performanceDeadline: baseTimestamp - 3600,
        disputeDeadline: baseTimestamp + 86400,
        dispute: {
          opener: USER_ALICE, // Alice opened dispute
          responseDeadline: baseTimestamp + 86400 * 2, // 48h left for Bob
          arbiterDeadline: 0,
        },
      },
    ]

    // Bob is respondent
    const bobAlerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_BOB)
    expect(bobAlerts).toHaveLength(1)
    expect(bobAlerts[0].category).toBe('disputes')
    expect(bobAlerts[0].priority).toBe('critical')
    expect(bobAlerts[0].title).toContain('Dispute Opened')
    expect(bobAlerts[0].actionLabel).toBe('Respond to Dispute')

    // Alice is opener; she does not need a response prompt
    const aliceAlerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_ALICE)
    expect(aliceAlerts).toHaveLength(0)
  })

  it('generates Arbiter action alert when both parties bonded', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 105,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 3, // Disputed
        offerExpiry: baseTimestamp - 86400,
        performanceDeadline: baseTimestamp - 3600,
        disputeDeadline: baseTimestamp + 86400,
        dispute: {
          opener: USER_ALICE,
          responseDeadline: baseTimestamp - 3600,
          arbiterDeadline: baseTimestamp + 86400 * 10, // 10 days left
        },
      },
    ]

    const arbiterAlerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_ARBITER)
    expect(arbiterAlerts).toHaveLength(1)
    expect(arbiterAlerts[0].priority).toBe('urgent')
    expect(arbiterAlerts[0].actionLabel).toBe('Rule Dispute')
  })

  it('generates claimable pull credit notifications', () => {
    const credits: UserCreditsForNotification[] = [
      { token: '0xusdc', symbol: 'USDC', amount: 50_000_000n }, // 50 USDC
    ]

    const alerts = evaluateDeadlineAlerts([], baseTimestamp, USER_ALICE, DEFAULT_NOTIFICATION_PREFERENCES, credits)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].category).toBe('withdrawals')
    expect(alerts[0].priority).toBe('success')
    expect(alerts[0].deepLink).toBe('/me')
  })

  it('deduplicates duplicate event logs deterministically', () => {
    const n1: PactNotification = {
      id: generateNotificationId(101, 'offer-expiring', 472222),
      pactId: 101,
      category: 'deadlines',
      priority: 'urgent',
      title: 'Offer Expiring',
      message: 'Notice 1',
      deepLink: '/p/101',
      timestamp: 1000,
      read: false,
    }

    const n2: PactNotification = {
      ...n1,
      timestamp: 2000, // duplicate with updated timestamp
    }

    const result = deduplicateNotifications([n1, n2])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(n1.id)
  })

  it('respects category preferences and filters disabled alerts', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 101,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 0, // Offered
        offerExpiry: baseTimestamp + 3600,
        performanceDeadline: baseTimestamp + 86400,
        disputeDeadline: baseTimestamp + 86400 * 2,
      },
    ]

    const customPrefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabledCategories: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.enabledCategories,
        deadlines: false, // Deadlines disabled
      },
    }

    const alerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_BOB, customPrefs)
    expect(alerts).toHaveLength(0)
  })

  it('enforces privacy invariant: notifications contain zero private plaintext or raw calldata', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 106,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 1,
        offerExpiry: baseTimestamp - 3600,
        performanceDeadline: baseTimestamp + 7200,
        disputeDeadline: baseTimestamp + 86400,
      },
    ]

    const alerts = evaluateDeadlineAlerts(pacts, baseTimestamp, USER_BOB)
    for (const alert of alerts) {
      // Must not leak private terms or calldata
      expect(alert.title).not.toContain('0x')
      expect(alert.message).not.toContain('0x')
      expect(alert.message).not.toContain('private')
      expect(alert.deepLink).toMatch(/^\/(p\/\d+|me)$/)
    }
  })

  it('ignores pacts where user is neither maker, taker, nor arbiter', () => {
    const pacts: PactDataForNotification[] = [
      {
        id: 107,
        maker: USER_ALICE,
        taker: USER_BOB,
        arbiter: USER_ARBITER,
        status: 1,
        offerExpiry: baseTimestamp - 3600,
        performanceDeadline: baseTimestamp + 7200,
        disputeDeadline: baseTimestamp + 86400,
      },
    ]

    const strangerAlerts = evaluateDeadlineAlerts(pacts, baseTimestamp, STRANGER)
    expect(strangerAlerts).toHaveLength(0)
  })
})
