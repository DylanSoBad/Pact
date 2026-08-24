import { describe, expect, it } from 'vitest'
import { PactData } from '../lib/reads'

function pact(overrides: Partial<PactData>): PactData {
  return {
    id: 1,
    maker: '0x1111111111111111111111111111111111111111',
    taker: '0x2222222222222222222222222222222222222222',
    arbiter: '0x3333333333333333333333333333333333333333',
    tokenMaker: '0x3600000000000000000000000000000000000000',
    tokenTaker: '0x0000000000000000000000000000000000000000',
    amountMaker: 100_000_000n,
    amountTaker: 0n,
    collateralMaker: 100_000_000n,
    collateralTaker: 0n,
    notionalUSDC: 100_000_000n,
    bondAmount: 5_000_000n,
    arbiterFeeCap: 1_000_000n,
    offerExpiry: 1_700_005_000n,
    performanceDeadline: 1_700_006_000n,
    disputeDeadline: 1_700_007_000n,
    createdAt: 1_700_000_000n,
    updatedAt: 1_700_000_100n,
    kind: 0,
    status: 0,
    blurSize: false,
    termsHash: '0xabcdef',
    proofHash: '0x',
    deadline: 1_700_007_000n,
    ...overrides,
  }
}

function filterPacts(pacts: PactData[], filter: string): PactData[] {
  return pacts.filter(current => {
    if (filter === 'ALL') return true
    if (filter === 'LIVE') return current.status >= 1 && current.status <= 3
    if (filter === 'DELIVERY') return current.kind === 0
    if (filter === 'JOB') return current.kind === 1
    return true
  })
}

describe('V1 filter logic', () => {
  const records = [
    pact({ id: 1, kind: 0, status: 1 }),
    pact({ id: 2, kind: 1, status: 4 }),
    pact({ id: 3, kind: 1, status: 3 }),
  ]

  it('filters supported kinds', () => {
    expect(filterPacts(records, 'DELIVERY').map(item => item.id)).toEqual([1])
    expect(filterPacts(records, 'JOB').map(item => item.id)).toEqual([2, 3])
  })

  it('treats Active, ProofSubmitted and Disputed as live', () => {
    expect(filterPacts(records, 'LIVE').map(item => item.id)).toEqual([1, 3])
  })

  it('returns every pact for ALL', () => {
    expect(filterPacts(records, 'ALL')).toHaveLength(3)
  })
})
