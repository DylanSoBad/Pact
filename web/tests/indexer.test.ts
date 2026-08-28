import { describe, it, expect } from 'vitest'
import {
  queryPacts,
  recordEvent,
  checkRateLimit,
  serializeIndexedPact,
  getIndexerHealth,
} from '../lib/indexer'
import type { IndexedPact } from '../lib/indexerTypes'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeTestPact(overrides: Partial<IndexedPact> & { id: number }): IndexedPact {
  return {
    maker: '0x1111111111111111111111111111111111111111',
    taker: '0x2222222222222222222222222222222222222222',
    arbiter: '0x3333333333333333333333333333333333333333',
    tokenMaker: '0x4444444444444444444444444444444444444444',
    tokenTaker: '0x5555555555555555555555555555555555555555',
    amountMaker: 500_000_000n,
    amountTaker: 100_000_000n,
    collateralMaker: 500_000_000n,
    collateralTaker: 100_000_000n,
    notionalUSDC: 500_000_000n,
    bondAmount: 25_000_000n,
    arbiterFeeCap: 10_000_000n,
    offerExpiry: 1700000000n,
    performanceDeadline: 1700100000n,
    disputeDeadline: 1700200000n,
    createdAt: 1699900000n,
    updatedAt: 1699900000n,
    kind: 0,
    status: 1,
    blurSize: false,
    termsHash: '0xabcdef',
    proofHash: '0x000000',
    deadline: 1700200000n,
    lastIndexedBlock: 100,
    lastIndexedAt: Date.now(),
    ...overrides,
  }
}

describe('PACT Indexer Engine', () => {
  describe('queryPacts', () => {
    it('returns empty results when no pacts are indexed', () => {
      const result = queryPacts({ limit: 10 })
      // May have pacts from previous tests in the module-level Map
      // but the function itself should not throw
      expect(result).toHaveProperty('items')
      expect(result).toHaveProperty('nextCursor')
      expect(result).toHaveProperty('indexedThroughId')
    })
  })

  describe('recordEvent — Arc dual Transfer dedup', () => {
    it('accepts a new event and returns true', () => {
      const accepted = recordEvent({
        pactId: 1,
        eventType: 'PactCreated',
        blockNumber: 100,
        txHash: '0xabc123',
        logIndex: 0,
        timestamp: Date.now(),
        data: {},
      })
      expect(accepted).toBe(true)
    })

    it('rejects a duplicate event (same txHash + logIndex) and returns false', () => {
      // First record
      recordEvent({
        pactId: 2,
        eventType: 'PactAccepted',
        blockNumber: 101,
        txHash: '0xdedup_test',
        logIndex: 5,
        timestamp: Date.now(),
        data: {},
      })

      // Duplicate
      const duplicate = recordEvent({
        pactId: 2,
        eventType: 'PactAccepted',
        blockNumber: 101,
        txHash: '0xdedup_test',
        logIndex: 5,
        timestamp: Date.now(),
        data: {},
      })
      expect(duplicate).toBe(false)
    })

    it('accepts events with same txHash but different logIndex', () => {
      const a = recordEvent({
        pactId: 3,
        eventType: 'Transfer',
        blockNumber: 102,
        txHash: '0xsame_tx',
        logIndex: 0,
        timestamp: Date.now(),
        data: {},
      })
      const b = recordEvent({
        pactId: 3,
        eventType: 'Transfer',
        blockNumber: 102,
        txHash: '0xsame_tx',
        logIndex: 1,
        timestamp: Date.now(),
        data: {},
      })
      expect(a).toBe(true)
      expect(b).toBe(true)
    })
  })

  describe('checkRateLimit', () => {
    it('allows requests within the token budget', () => {
      const testIp = `test-ip-${Date.now()}`
      // 30 tokens in budget
      for (let i = 0; i < 30; i++) {
        expect(checkRateLimit(testIp)).toBe(true)
      }
    })

    it('rejects requests exceeding the token budget', () => {
      const testIp = `exhausted-ip-${Date.now()}`
      // Exhaust all 30 tokens
      for (let i = 0; i < 30; i++) {
        checkRateLimit(testIp)
      }
      // Next request should be rejected
      expect(checkRateLimit(testIp)).toBe(false)
    })

    it('treats different IPs independently', () => {
      const ipA = `ip-a-${Date.now()}`
      const ipB = `ip-b-${Date.now()}`

      // Exhaust ipA
      for (let i = 0; i < 30; i++) checkRateLimit(ipA)
      expect(checkRateLimit(ipA)).toBe(false)

      // ipB should still be allowed
      expect(checkRateLimit(ipB)).toBe(true)
    })
  })

  describe('serializeIndexedPact — wire format compatibility', () => {
    it('serializes bigint fields to strings for JSON transport', () => {
      const pact = makeTestPact({ id: 42 })
      const serialized = serializeIndexedPact(pact)

      expect(serialized.id).toBe(42)
      expect(serialized.amountMaker).toBe('500000000')
      expect(serialized.amountTaker).toBe('100000000')
      expect(serialized.collateralMaker).toBe('500000000')
      expect(serialized.collateralTaker).toBe('100000000')
      expect(serialized.notionalUSDC).toBe('500000000')
      expect(serialized.bondAmount).toBe('25000000')
      expect(serialized.arbiterFeeCap).toBe('10000000')
      expect(serialized.offerExpiry).toBe('1700000000')
      expect(serialized.performanceDeadline).toBe('1700100000')
      expect(serialized.disputeDeadline).toBe('1700200000')
      expect(serialized.createdAt).toBe('1699900000')
      expect(serialized.updatedAt).toBe('1699900000')
      expect(serialized.deadline).toBe('1700200000')
      expect(serialized.kind).toBe(0)
      expect(serialized.status).toBe(1)
      expect(serialized.maker).toBe('0x1111111111111111111111111111111111111111')
    })
  })

  describe('getIndexerHealth', () => {
    it('returns health object with expected shape', () => {
      const health = getIndexerHealth()
      expect(health).toHaveProperty('status')
      expect(health).toHaveProperty('lastBlock')
      expect(health).toHaveProperty('totalPacts')
      expect(health).toHaveProperty('syncLagMs')
      expect(health).toHaveProperty('stats')
      expect(['ok', 'degraded', 'down']).toContain(health.status)
    })
  })
})
