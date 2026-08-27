import { describe, expect, it } from 'vitest'
import { getDeadlineStatus } from '../lib/countdown'

describe('Countdown & Deadline Urgency 4-Tier Standardization', () => {
  const baseNow = 1_700_000_000

  it('classifies deadlines > 7 days as AMPLE (Emerald Green)', () => {
    // 8 days in the future
    const deadline = baseNow + 8 * 86400
    const status = getDeadlineStatus(deadline, baseNow)

    expect(status.tier).toBe('AMPLE')
    expect(status.isAmple).toBe(true)
    expect(status.isWarning).toBe(false)
    expect(status.isUrgent).toBe(false)
    expect(status.isExpired).toBe(false)
    expect(status.textColor).toBe('text-emerald-400')
    expect(status.badgeStyle).toContain('emerald')
    expect(status.compactFormatted).toBe('8d')
    expect(status.fullFormatted).toBe('8d')
  })

  it('classifies deadlines exactly at 7 days boundary as WARNING (Amber)', () => {
    // 7 days exact
    const deadline = baseNow + 7 * 86400
    const status = getDeadlineStatus(deadline, baseNow)

    expect(status.tier).toBe('WARNING')
    expect(status.isWarning).toBe(true)
    expect(status.textColor).toBe('text-amber-300')
    expect(status.badgeStyle).toContain('amber')
    expect(status.compactFormatted).toBe('7d')
    expect(status.fullFormatted).toBe('7d')
  })

  it('classifies deadlines between 1 and 7 days as WARNING (Amber)', () => {
    // 3 days, 4 hours, 15 minutes, 20 seconds
    const deadline = baseNow + 3 * 86400 + 4 * 3600 + 15 * 60 + 20
    const status = getDeadlineStatus(deadline, baseNow)

    expect(status.tier).toBe('WARNING')
    expect(status.isWarning).toBe(true)
    expect(status.textColor).toBe('text-amber-300')
    expect(status.compactFormatted).toBe('3d 4h')
    expect(status.fullFormatted).toBe('3d 4h 15m 20s')
    expect(status.cardHighlightStyle).toContain('amber')
  })

  it('classifies deadlines at 24 hours boundary as WARNING (1 day)', () => {
    // 24 hours exact (1 day)
    const deadline = baseNow + 86400
    const status = getDeadlineStatus(deadline, baseNow)

    expect(status.tier).toBe('WARNING')
    expect(status.isWarning).toBe(true)
    expect(status.textColor).toBe('text-amber-300')
    expect(status.compactFormatted).toBe('1d')
  })

  it('classifies deadlines < 24 hours as URGENT (Bright Orange)', () => {
    // 23 hours, 59 minutes
    const deadline23h = baseNow + 23 * 3600 + 59 * 60
    const status23h = getDeadlineStatus(deadline23h, baseNow)
    expect(status23h.tier).toBe('URGENT')
    expect(status23h.isUrgent).toBe(true)
    expect(status23h.textColor).toBe('text-orange-400')
    expect(status23h.compactFormatted).toBe('23h 59m')

    // 5 hours, 30 minutes, 10 seconds
    const deadline5h = baseNow + 5 * 3600 + 30 * 60 + 10
    const status5h = getDeadlineStatus(deadline5h, baseNow)

    expect(status5h.tier).toBe('URGENT')
    expect(status5h.isUrgent).toBe(true)
    expect(status5h.textColor).toBe('text-orange-400')
    expect(status5h.compactFormatted).toBe('5h 30m')
    expect(status5h.fullFormatted).toBe('5h 30m 10s')
    expect(status5h.cardHighlightStyle).toContain('orange')
    expect(status5h.cardHighlightStyle).toContain('ring-1')
  })

  it('classifies deadlines under 1 hour correctly', () => {
    // 45 minutes, 30 seconds
    const deadline = baseNow + 45 * 60 + 30
    const status = getDeadlineStatus(deadline, baseNow)

    expect(status.tier).toBe('URGENT')
    expect(status.compactFormatted).toBe('45m 30s')
    expect(status.fullFormatted).toBe('45m 30s')
  })

  it('classifies deadline under 1 minute correctly', () => {
    // 45 seconds
    const deadline = baseNow + 45
    const status = getDeadlineStatus(deadline, baseNow)

    expect(status.tier).toBe('URGENT')
    expect(status.compactFormatted).toBe('45s')
    expect(status.fullFormatted).toBe('45s')
  })

  it('classifies expired deadlines (diff <= 0) as EXPIRED (Rose Red)', () => {
    // Exactly at deadline (diff == 0)
    const exactStatus = getDeadlineStatus(baseNow, baseNow)
    expect(exactStatus.tier).toBe('EXPIRED')
    expect(exactStatus.isExpired).toBe(true)
    expect(exactStatus.textColor).toBe('text-rose-400')
    expect(exactStatus.badgeStyle).toContain('rose')
    expect(exactStatus.compactFormatted).toBe('EXPIRED')
    expect(exactStatus.fullFormatted).toBe('EXPIRED / SETTLEMENT DUE')

    // 100 seconds past deadline (diff < 0)
    const pastStatus = getDeadlineStatus(baseNow - 100, baseNow)
    expect(pastStatus.tier).toBe('EXPIRED')
    expect(pastStatus.isExpired).toBe(true)
    expect(pastStatus.textColor).toBe('text-rose-400')
  })

  it('supports bigint timestamp inputs', () => {
    const deadline = BigInt(baseNow + 2 * 86400)
    const status = getDeadlineStatus(deadline, baseNow)

    expect(status.tier).toBe('WARNING')
    expect(status.compactFormatted).toBe('2d')
  })

  it('ensures compact formatted strings fit comfortably on 360px & 390px mobile viewports', () => {
    const testDiffs = [
      10 * 86400, // 10d
      3 * 86400 + 12 * 3600, // 3d 12h
      14 * 3600 + 45 * 60, // 14h 45m
      59 * 60 + 59, // 59m 59s
      45, // 45s
      0, // Expired
      -100, // Expired
    ]

    for (const diff of testDiffs) {
      const status = getDeadlineStatus(baseNow + diff, baseNow)
      // Compact string should never exceed 12 characters to prevent horizontal wrapping
      expect(status.compactFormatted.length).toBeLessThanOrEqual(12)
    }
  })

  it('provides accessible ariaLabel descriptions for screen readers', () => {
    const ample = getDeadlineStatus(baseNow + 10 * 86400, baseNow)
    expect(ample.ariaLabel).toContain('10 days')

    const urgent = getDeadlineStatus(baseNow + 3 * 3600 + 15 * 60, baseNow)
    expect(urgent.ariaLabel).toContain('Urgent')

    const expired = getDeadlineStatus(baseNow - 10, baseNow)
    expect(expired.ariaLabel).toContain('expired')
  })
})
