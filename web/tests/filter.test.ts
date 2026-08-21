import { describe, it, expect } from 'vitest'
import { PactData } from '../lib/reads'

function filterPacts(pacts: PactData[], filter: string): PactData[] {
  return pacts.filter((p) => {
    if (filter === 'ALL') return true
    if (filter === 'LIVE') return p.status === 2 || p.status === 3
    if (filter === 'DELIVERY') return p.kind === 0
    if (filter === 'FX') return p.kind === 1
    if (filter === 'JOB') return p.kind === 2
    return true
  })
}

describe('Filter Logic', () => {
  const mockPacts: PactData[] = [
    {
      id: 1,
      maker: '0x1111111111111111111111111111111111111111',
      amountMaker: 100000000n,
      kind: 0, // DELIVERY
      status: 2, // ACTIVE (LIVE)
      taker: '0x2222222222222222222222222222222222222222',
      amountTaker: 0n,
      blurSize: false,
      tokenMaker: '0x3333333333333333333333333333333333333333',
      createdAt: 1700000000n,
      tokenTaker: '0x0000000000000000000000000000000000000000',
      updatedAt: 1700000100n,
      termsHash: '0xabcdef',
      proofHash: '0x',
      deadline: 1700005000n,
    },
    {
      id: 2,
      maker: '0x4444444444444444444444444444444444444444',
      amountMaker: 50000000n,
      kind: 1, // FX
      status: 4, // CLEARED (Terminal)
      taker: '0x5555555555555555555555555555555555555555',
      amountTaker: 45000000n,
      blurSize: false,
      tokenMaker: '0x3333333333333333333333333333333333333333',
      createdAt: 1700000200n,
      tokenTaker: '0x6666666666666666666666666666666666666666',
      updatedAt: 1700000300n,
      termsHash: '0x123456',
      proofHash: '0x7890',
      deadline: 1700006000n,
    },
    {
      id: 3,
      maker: '0x7777777777777777777777777777777777777777',
      amountMaker: 200000000n,
      kind: 2, // JOB
      status: 3, // PROOF IN (LIVE)
      taker: '0x8888888888888888888888888888888888888888',
      amountTaker: 0n,
      blurSize: true,
      tokenMaker: '0x3333333333333333333333333333333333333333',
      createdAt: 1700000400n,
      tokenTaker: '0x0000000000000000000000000000000000000000',
      updatedAt: 1700000500n,
      termsHash: '0x999999',
      proofHash: '0xaaaa',
      deadline: 1700007000n,
    },
  ]

  it('filters ALL pacts', () => {
    const result = filterPacts(mockPacts, 'ALL')
    expect(result.length).toBe(3)
  })

  it('filters DELIVERY kind', () => {
    const result = filterPacts(mockPacts, 'DELIVERY')
    expect(result.length).toBe(1)
    expect(result[0].id).toBe(1)
  })

  it('filters FX kind', () => {
    const result = filterPacts(mockPacts, 'FX')
    expect(result.length).toBe(1)
    expect(result[0].id).toBe(2)
  })

  it('filters JOB kind', () => {
    const result = filterPacts(mockPacts, 'JOB')
    expect(result.length).toBe(1)
    expect(result[0].id).toBe(3)
  })

  it('filters LIVE status (ACTIVE status=2 or PROOF IN status=3)', () => {
    const result = filterPacts(mockPacts, 'LIVE')
    expect(result.length).toBe(2)
    expect(result.map((p) => p.id)).toEqual([1, 3])
  })
})
