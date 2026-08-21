import { describe, it, expect } from 'vitest'
import {
  formatAmount,
  parseAmount,
  truncateAddress,
  kindLabel,
  statusLabel,
  isTerminal,
  isZeroAddress,
} from '../lib/format'

describe('Format Utilities', () => {
  describe('formatAmount', () => {
    it('correctly formats raw bigint amounts (6 decimals)', () => {
      expect(formatAmount(1000000n)).toBe('1.00')
      expect(formatAmount(25000000n)).toBe('25.00')
      expect(formatAmount(1234567n)).toBe('1.23')
      expect(formatAmount(0n)).toBe('0.00')
    })
  })

  describe('parseAmount', () => {
    it('parses human input string into bigint', () => {
      expect(parseAmount('1')).toBe(1000000n)
      expect(parseAmount('25.5')).toBe(25500000n)
      expect(parseAmount('1,000.50')).toBe(1000500000n)
      expect(parseAmount('')).toBe(0n)
      expect(parseAmount('invalid')).toBe(0n)
    })
  })

  describe('truncateAddress', () => {
    it('truncates standard 0x ethereum addresses', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      expect(truncateAddress(address)).toBe('0x1234…5678')
    })

    it('handles zero address and empty strings', () => {
      expect(truncateAddress('')).toBe('—')
      expect(truncateAddress('0x0000000000000000000000000000000000000000')).toBe('—')
    })
  })

  describe('kindLabel & statusLabel', () => {
    it('maps kind enum correctly', () => {
      expect(kindLabel(0)).toBe('DELIVERY')
      expect(kindLabel(1)).toBe('FX')
      expect(kindLabel(2)).toBe('JOB')
      expect(kindLabel(99)).toBe('KIND(99)')
    })

    it('maps status enum correctly', () => {
      expect(statusLabel(0)).toBe('OPEN')
      expect(statusLabel(1)).toBe('FUNDED')
      expect(statusLabel(2)).toBe('ACTIVE')
      expect(statusLabel(3)).toBe('PROOF IN')
      expect(statusLabel(4)).toBe('CLEARED')
      expect(statusLabel(5)).toBe('SLASHED')
      expect(statusLabel(6)).toBe('EXPIRED')
      expect(statusLabel(7)).toBe('CANCELLED')
    })
  })

  describe('isTerminal & isZeroAddress', () => {
    it('identifies terminal contract states', () => {
      expect(isTerminal(0)).toBe(false)
      expect(isTerminal(2)).toBe(false)
      expect(isTerminal(4)).toBe(true) // Cleared
      expect(isTerminal(5)).toBe(true) // Slashed
      expect(isTerminal(6)).toBe(true) // Expired
      expect(isTerminal(7)).toBe(true) // Cancelled
    })

    it('identifies zero addresses', () => {
      expect(isZeroAddress('0x0000000000000000000000000000000000000000')).toBe(true)
      expect(isZeroAddress('')).toBe(true)
      expect(isZeroAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(false)
    })
  })
})
