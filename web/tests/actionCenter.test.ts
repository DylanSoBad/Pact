import { describe, expect, it } from 'vitest'
import { actionsFor } from '../components/ActionCenter'
import type { PactData } from '../lib/reads'

const maker = '0x1111111111111111111111111111111111111111'
const taker = '0x2222222222222222222222222222222222222222'
const arbiter = '0x3333333333333333333333333333333333333333'

function pact(status: number): PactData {
  return {
    id: 7, maker, taker, arbiter, status, kind: 0, blurSize: false,
    tokenMaker: maker, tokenTaker: taker, termsHash: '0x', proofHash: '0x',
    amountMaker: 1n, amountTaker: 1n, collateralMaker: 1n, collateralTaker: 1n,
    notionalUSDC: 1n, bondAmount: 1n, arbiterFeeCap: 1n,
    offerExpiry: 200n, performanceDeadline: 300n, disputeDeadline: 400n,
    createdAt: 1n, updatedAt: 1n, deadline: 400n,
  }
}

describe('Action Center decisions', () => {
  it('asks the designated counterparty to verify an offered pact', () => {
    expect(actionsFor([pact(0)], taker, 100n)[0]?.title).toBe('Verify and accept offer')
  })

  it('prevents counterparty from accepting an expired offer and prompts maker to expire it', () => {
    // Past offerExpiry (200n)
    const takerActions = actionsFor([pact(0)], taker, 201n)
    expect(takerActions[0]?.title).toBe('Offer expired')

    const makerActions = actionsFor([pact(0)], maker, 201n)
    expect(makerActions[0]?.title).toBe('Expire unaccepted offer')
  })

  it('shows claim payout to taker when proof was submitted and dispute window elapsed', () => {
    expect(actionsFor([pact(2)], taker, 401n)[0]?.title).toBe('Claim collateral & payout (Deadline settlement)')
  })

  it('shows execute final settlement to maker when proof was submitted and dispute window elapsed', () => {
    expect(actionsFor([pact(2)], maker, 401n)[0]?.title).toBe('Execute final settlement')
  })

  it('shows claim full collateral refund to maker when no proof was submitted and dispute window elapsed', () => {
    expect(actionsFor([pact(1)], maker, 401n)[0]?.title).toBe('Claim full collateral refund (Deadline settlement)')
  })

  it('routes a disputed pact to its arbiter', () => {
    expect(actionsFor([pact(3)], arbiter, 100n)[0]?.title).toBe('Review contested pact')
  })
})
