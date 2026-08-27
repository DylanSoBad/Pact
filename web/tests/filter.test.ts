import { describe, expect, it } from 'vitest'
import { PactData } from '../lib/reads'
import {
  filterOverviewPacts,
  filterPortfolioPacts,
  requiresActionFrom,
  type OverviewFilter,
  type PortfolioRoleFilter,
  type PortfolioStatusFilter
} from '../lib/filter'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const CHARLIE = '0x3333333333333333333333333333333333333333'
const BASE_NOW = 1_700_000_000n

function createPact(overrides: Partial<PactData>): PactData {
  return {
    id: 1,
    maker: ALICE,
    taker: BOB,
    arbiter: CHARLIE,
    tokenMaker: '0x3600000000000000000000000000000000000000',
    tokenTaker: '0x0000000000000000000000000000000000000000',
    amountMaker: 100_000_000n,
    amountTaker: 0n,
    collateralMaker: 100_000_000n,
    collateralTaker: 0n,
    notionalUSDC: 100_000_000n,
    bondAmount: 5_000_000n,
    arbiterFeeCap: 1_000_000n,
    offerExpiry: BASE_NOW + 86400n,
    performanceDeadline: BASE_NOW + 2n * 86400n,
    disputeDeadline: BASE_NOW + 3n * 86400n,
    createdAt: BASE_NOW,
    updatedAt: BASE_NOW + 100n,
    kind: 0,
    status: 0,
    blurSize: false,
    termsHash: '0xabcdef',
    proofHash: '0x',
    deadline: BASE_NOW + 3n * 86400n,
    ...overrides,
  }
}

describe('Overview Filter Logic (filterOverviewPacts)', () => {
  const records = [
    createPact({ id: 1, kind: 0, status: 1 }), // Delivery, Active
    createPact({ id: 2, kind: 1, status: 4 }), // Job, Settled
    createPact({ id: 3, kind: 1, status: 3 }), // Job, Disputed
    createPact({ id: 4, kind: 0, status: 0, offerExpiry: BASE_NOW - 100n }), // Delivery, Offered (Expired)
    createPact({ id: 5, kind: 0, status: 6 }), // Delivery, Terminal Expired
  ]

  it('filters by category kinds', () => {
    expect(filterOverviewPacts(records, 'DELIVERY', BASE_NOW).map(p => p.id)).toEqual([1, 4, 5])
    expect(filterOverviewPacts(records, 'JOB', BASE_NOW).map(p => p.id)).toEqual([2, 3])
  })

  it('filters live feeds (status 1..3)', () => {
    expect(filterOverviewPacts(records, 'LIVE', BASE_NOW).map(p => p.id)).toEqual([1, 3])
  })

  it('filters disputed pacts (status 3)', () => {
    expect(filterOverviewPacts(records, 'DISPUTED', BASE_NOW).map(p => p.id)).toEqual([3])
  })

  it('filters expired pacts (effective expired and terminal status 6)', () => {
    expect(filterOverviewPacts(records, 'EXPIRED', BASE_NOW).map(p => p.id)).toEqual([4, 5])
  })

  it('returns all pacts for ALL filter', () => {
    expect(filterOverviewPacts(records, 'ALL', BASE_NOW).map(p => p.id)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('Portfolio Action Required Predicate (requiresActionFrom)', () => {
  it('identifies taker can accept open offer before expiry', () => {
    const pact = createPact({ status: 0, offerExpiry: BASE_NOW + 100n })
    expect(requiresActionFrom(pact, BOB, BASE_NOW)).toBe(true)
    expect(requiresActionFrom(pact, ALICE, BASE_NOW)).toBe(false)
  })

  it('identifies maker can cancel/expire open offer after expiry', () => {
    const pact = createPact({ status: 0, offerExpiry: BASE_NOW - 100n })
    expect(requiresActionFrom(pact, ALICE, BASE_NOW)).toBe(true)
    expect(requiresActionFrom(pact, BOB, BASE_NOW)).toBe(false)
  })

  it('identifies taker can submit proof during active stage', () => {
    const pact = createPact({ status: 1, performanceDeadline: BASE_NOW + 1000n })
    expect(requiresActionFrom(pact, BOB, BASE_NOW)).toBe(true)
    expect(requiresActionFrom(pact, ALICE, BASE_NOW)).toBe(false)
  })

  it('identifies maker can refund when active pact passes dispute deadline without proof', () => {
    const pact = createPact({
      status: 1,
      performanceDeadline: BASE_NOW - 100n,
      disputeDeadline: BASE_NOW - 50n
    })
    expect(requiresActionFrom(pact, ALICE, BASE_NOW)).toBe(true)
    expect(requiresActionFrom(pact, BOB, BASE_NOW)).toBe(false)
  })

  it('identifies maker can release or dispute when proof is submitted', () => {
    const pact = createPact({ status: 2, disputeDeadline: BASE_NOW + 500n })
    expect(requiresActionFrom(pact, ALICE, BASE_NOW)).toBe(true)
    expect(requiresActionFrom(pact, BOB, BASE_NOW)).toBe(false)
  })

  it('identifies taker can claim payout when proof dispute window lapses', () => {
    const pact = createPact({ status: 2, disputeDeadline: BASE_NOW - 500n })
    expect(requiresActionFrom(pact, BOB, BASE_NOW)).toBe(true)
    expect(requiresActionFrom(pact, ALICE, BASE_NOW)).toBe(false)
  })

  it('identifies arbiter action when disputed', () => {
    const pact = createPact({ status: 3 })
    expect(requiresActionFrom(pact, CHARLIE, BASE_NOW)).toBe(true)
    expect(requiresActionFrom(pact, ALICE, BASE_NOW)).toBe(true)
  })
})

describe('Portfolio Multi-Dimensional Filter Logic (filterPortfolioPacts)', () => {
  const userPacts = [
    createPact({ id: 1, maker: ALICE, taker: BOB, status: 0, offerExpiry: BASE_NOW + 1000n }), // Alice Maker, Bob Taker, Pending Bob accept
    createPact({ id: 2, maker: ALICE, taker: BOB, status: 1, performanceDeadline: BASE_NOW + 2000n }), // Alice Maker, Bob Taker, Pending Bob proof
    createPact({ id: 3, maker: BOB, taker: ALICE, status: 2, disputeDeadline: BASE_NOW + 500n }), // Bob Maker, Alice Taker, Pending Bob release/dispute
    createPact({ id: 4, maker: ALICE, taker: BOB, status: 4 }), // Alice Maker, Bob Taker, Settled
    createPact({ id: 5, maker: ALICE, taker: BOB, status: 6 }), // Alice Maker, Bob Taker, Expired
  ]

  it('filters by Role: AS MAKER', () => {
    const result = filterPortfolioPacts(userPacts, {
      role: 'MAKER',
      status: 'ALL',
      accountAddress: ALICE,
      currentNowTs: BASE_NOW
    })
    expect(result.map(p => p.id)).toEqual([1, 2, 4, 5])
  })

  it('filters by Role: AS COUNTERPARTY (TAKER)', () => {
    const result = filterPortfolioPacts(userPacts, {
      role: 'TAKER',
      status: 'ALL',
      accountAddress: ALICE,
      currentNowTs: BASE_NOW
    })
    expect(result.map(p => p.id)).toEqual([3])
  })

  it('filters combined Role: AS COUNTERPARTY (TAKER) and Status: ACTION_REQUIRED', () => {
    // When Alice is Taker, in Pact 2 Bob is Taker (needs proof).
    // In Pact 1 (Bob is Taker, needs accept).
    const bobActions = filterPortfolioPacts(userPacts, {
      role: 'TAKER',
      status: 'ACTION_REQUIRED',
      accountAddress: BOB,
      currentNowTs: BASE_NOW
    })
    expect(bobActions.map(p => p.id)).toEqual([1, 2])
  })

  it('filters Status: SETTLED', () => {
    const settled = filterPortfolioPacts(userPacts, {
      role: 'ALL',
      status: 'SETTLED',
      accountAddress: ALICE,
      currentNowTs: BASE_NOW
    })
    expect(settled.map(p => p.id)).toEqual([4])
  })

  it('filters Status: EXPIRED', () => {
    const expired = filterPortfolioPacts(userPacts, {
      role: 'ALL',
      status: 'EXPIRED',
      accountAddress: ALICE,
      currentNowTs: BASE_NOW
    })
    expect(expired.map(p => p.id)).toEqual([5])
  })
})

describe('Cursor Pagination & Deduplication Logic', () => {
  it('deduplicates appended pages and keeps latest records descending', () => {
    const page1 = [
      createPact({ id: 10, updatedAt: 100n }),
      createPact({ id: 9, updatedAt: 90n }),
    ]
    const page2 = [
      createPact({ id: 9, updatedAt: 95n }), // Duplicate item with updated state
      createPact({ id: 8, updatedAt: 80n }),
    ]

    const combined = [...page1, ...page2]
    const deduplicated = [...new Map(combined.map(p => [p.id, p])).values()].sort((a, b) => b.id - a.id)

    expect(deduplicated.map(p => p.id)).toEqual([10, 9, 8])
    expect(deduplicated.length).toBe(3)
  })
})
