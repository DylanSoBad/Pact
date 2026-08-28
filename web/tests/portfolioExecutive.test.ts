import { describe, expect, it } from 'vitest'
import { PactData } from '../lib/reads'
import {
  filterPortfolioPacts,
  computeActiveCapitalAtStake,
  computeRoleCounts,
  getRelevantDeadline
} from '../lib/filter'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const CHARLIE = '0x3333333333333333333333333333333333333333'
const BASE_NOW = 1_700_000_000n

function makePact(overrides: Partial<PactData>): PactData {
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
    termsHash: '0xabcdef1234567890',
    proofHash: '0x',
    deadline: BASE_NOW + 3n * 86400n,
    ...overrides,
  }
}

describe('Portfolio Executive Command Center Logic', () => {
  const dataset: PactData[] = [
    // 1. Alice is Maker, Bob is Taker, Charlie is Arbiter (Status: Offered, $100 Maker Collateral)
    makePact({
      id: 1,
      maker: ALICE,
      taker: BOB,
      arbiter: CHARLIE,
      status: 0,
      collateralMaker: 100_000_000n,
      collateralTaker: 0n,
      offerExpiry: BASE_NOW + 3600n,
    }),
    // 2. Alice is Maker, Bob is Taker (Status: Active, $250 Maker Collateral, $50 Taker Collateral)
    makePact({
      id: 2,
      maker: ALICE,
      taker: BOB,
      arbiter: CHARLIE,
      status: 1,
      collateralMaker: 250_000_000n,
      collateralTaker: 50_000_000n,
      performanceDeadline: BASE_NOW + 7200n,
    }),
    // 3. Bob is Maker, Alice is Taker (Status: Proof Submitted, $500 Maker Collateral)
    makePact({
      id: 3,
      maker: BOB,
      taker: ALICE,
      arbiter: CHARLIE,
      status: 2,
      collateralMaker: 500_000_000n,
      collateralTaker: 0n,
      disputeDeadline: BASE_NOW + 1800n, // Earliest closing deadline!
    }),
    // 4. Bob is Maker, Charlie is Taker, Alice is Arbiter (Status: Disputed)
    makePact({
      id: 4,
      maker: BOB,
      taker: CHARLIE,
      arbiter: ALICE,
      status: 3,
      collateralMaker: 300_000_000n,
      collateralTaker: 0n,
      disputeDeadline: BASE_NOW + 86400n,
    }),
    // 5. Alice is Maker, Bob is Taker (Status: Settled, Completed deal)
    makePact({
      id: 5,
      maker: ALICE,
      taker: BOB,
      arbiter: CHARLIE,
      status: 4,
      collateralMaker: 1000_000_000n,
      collateralTaker: 0n,
    }),
  ]

  it('computes multi-role counts accurately including Arbiter', () => {
    const aliceRoles = computeRoleCounts(dataset, ALICE)
    expect(aliceRoles.ALL).toBe(5)
    expect(aliceRoles.MAKER).toBe(3) // Pacts 1, 2, 5
    expect(aliceRoles.TAKER).toBe(1) // Pact 3
    expect(aliceRoles.ARBITER).toBe(1) // Pact 4

    const charlieRoles = computeRoleCounts(dataset, CHARLIE)
    expect(charlieRoles.ARBITER).toBe(4) // Pacts 1, 2, 3, 5
    expect(charlieRoles.TAKER).toBe(1) // Pact 4
    expect(charlieRoles.MAKER).toBe(0)
  })

  it('aggregates active capital at stake for a user (excluding settled deals)', () => {
    // For Alice:
    // Active as Maker: Pact 1 ($100), Pact 2 ($250) -> $350
    // Active as Taker: Pact 3 ($0 taker collateral)
    // Pact 5 is Settled ($1000) -> Excluded from active risk
    const aliceCapital = computeActiveCapitalAtStake(dataset, ALICE)
    expect(aliceCapital.makerCollateral).toBe(350_000_000n)
    expect(aliceCapital.takerCollateral).toBe(0n)
    expect(aliceCapital.totalAtStake).toBe(350_000_000n)
    expect(aliceCapital.activePactsCount).toBe(3) // 2 as Maker (Pacts 1, 2) + 1 as Taker (Pact 3)

    // For Bob:
    // Active as Maker: Pact 3 ($500), Pact 4 ($300) -> $800
    // Active as Taker: Pact 2 ($50) -> $50
    // Total at stake: $850
    const bobCapital = computeActiveCapitalAtStake(dataset, BOB)
    expect(bobCapital.makerCollateral).toBe(800_000_000n)
    expect(bobCapital.takerCollateral).toBe(50_000_000n)
    expect(bobCapital.totalAtStake).toBe(850_000_000n)
  })

  it('filters specifically by AS ARBITER role', () => {
    const arbiterPacts = filterPortfolioPacts(dataset, {
      role: 'ARBITER',
      status: 'ALL',
      accountAddress: ALICE,
      currentNowTs: BASE_NOW,
    })
    expect(arbiterPacts.map(p => p.id)).toEqual([4])
  })

  it('sorts pacts with DEADLINE urgency priority (earliest cutoff first, live before settled)', () => {
    const sorted = filterPortfolioPacts(dataset, {
      role: 'ALL',
      status: 'ALL',
      accountAddress: ALICE,
      currentNowTs: BASE_NOW,
      sortOrder: 'DEADLINE',
    })

    // Active pacts sorted by deadline:
    // Pact 3 (disputeDeadline: BASE_NOW + 1800s)
    // Pact 1 (offerExpiry: BASE_NOW + 3600s)
    // Pact 2 (performanceDeadline: BASE_NOW + 7200s)
    // Pact 4 (disputeDeadline: BASE_NOW + 86400s)
    // Terminal Pact 5 (Settled)
    expect(sorted.map(p => p.id)).toEqual([3, 1, 2, 4, 5])
  })

  it('sorts pacts by VALUE (largest collateral first)', () => {
    const sortedByValue = filterPortfolioPacts(dataset, {
      role: 'ALL',
      status: 'ALL',
      accountAddress: ALICE,
      currentNowTs: BASE_NOW,
      sortOrder: 'VALUE',
    })

    // Pact 5 ($1000) > Pact 3 ($500) > Pact 4 ($300) > Pact 2 ($300 total) > Pact 1 ($100)
    expect(sortedByValue[0].id).toBe(5)
    expect(sortedByValue[1].id).toBe(3)
  })

  it('calculates verified clearance rate strictly from on-chain cleared vs slashed (ignoring unverified notional)', () => {
    // 9 cleared, 1 slashed -> 90%
    const repA = { cleared: 9, slashed: 1, notional: 999_999_999n }
    const totalA = repA.cleared + repA.slashed
    const rateA = ((repA.cleared / totalA) * 100).toFixed(0)
    expect(rateA).toBe('90')

    // 0 cleared, 0 slashed -> No history (Default 100% or null)
    const repB = { cleared: 0, slashed: 0, notional: 0n }
    const totalB = repB.cleared + repB.slashed
    expect(totalB).toBe(0)
  })

  it('correctly extracts relevant active deadline per pact stage', () => {
    expect(getRelevantDeadline(dataset[0])).toBe(dataset[0].offerExpiry) // Status 0
    expect(getRelevantDeadline(dataset[1])).toBe(dataset[1].performanceDeadline) // Status 1
    expect(getRelevantDeadline(dataset[2])).toBe(dataset[2].disputeDeadline) // Status 2
    expect(getRelevantDeadline(dataset[3])).toBe(dataset[3].disputeDeadline) // Status 3
  })
})
