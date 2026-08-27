import { describe, expect, it } from 'vitest'
import {
  effectiveStatusLabel,
  isOfferExpired,
  isDisputeWindowExpired,
  isTerminal,
} from '../lib/format'

const MAKER = '0x1111111111111111111111111111111111111111'
const TAKER = '0x2222222222222222222222222222222222222222'
const ARBITER = '0x3333333333333333333333333333333333333333'
const STRANGER = '0x9999999999999999999999999999999999999999'

// Mock state simulation matching Pact.sol V1 rules
type MockPact = {
  id: number
  maker: string
  taker: string
  arbiter: string
  tokenMaker: string
  tokenTaker: string
  amountMaker: bigint
  amountTaker: bigint
  collateralMaker: bigint
  collateralTaker: bigint
  bondAmount: bigint
  offerExpiry: bigint
  performanceDeadline: bigint
  disputeDeadline: bigint
  status: number // 0: Offered, 1: Active, 2: ProofSubmitted, 3: Disputed, 4: Settled, 5: Cancelled, 6: Expired
}

type MockDispute = {
  opener: string
  claim: number // 1: Maker, 2: Taker
  makerBond: bigint
  takerBond: bigint
  responseDeadline: bigint
  arbiterDeadline: bigint
}

type MockEscrowSystem = {
  pacts: Record<number, MockPact>
  disputes: Record<number, MockDispute>
  credits: Record<string, Record<string, bigint>>
}

function createSystem(): MockEscrowSystem {
  return { pacts: {}, disputes: {}, credits: {} }
}

function credit(sys: MockEscrowSystem, recipient: string, token: string, amount: bigint) {
  if (amount === 0n) return
  if (!sys.credits[recipient]) sys.credits[recipient] = {}
  sys.credits[recipient][token] = (sys.credits[recipient][token] ?? 0n) + amount
}

function withdraw(sys: MockEscrowSystem, sender: string, token: string): bigint {
  const bal = sys.credits[sender]?.[token] ?? 0n
  if (bal === 0n) throw new Error('NoCredit')
  sys.credits[sender][token] = 0n
  return bal
}

describe('1. Deadline Boundary Tests', () => {
  const offerExpiry = 1000n
  const disputeDeadline = 3000n

  it('correctly evaluates offerExpiry boundaries', () => {
    // Before deadline
    expect(isOfferExpired(0, offerExpiry, 999n)).toBe(false)
    // Exactly at deadline (block.timestamp == offerExpiry -> not expired yet on-chain)
    expect(isOfferExpired(0, offerExpiry, 1000n)).toBe(false)
    // Strictly after deadline (block.timestamp > offerExpiry -> expired)
    expect(isOfferExpired(0, offerExpiry, 1001n)).toBe(true)
  })

  it('correctly evaluates disputeDeadline boundaries for Active and ProofSubmitted states', () => {
    // Status 1 (Active)
    expect(isDisputeWindowExpired(1, disputeDeadline, 2999n)).toBe(false)
    expect(isDisputeWindowExpired(1, disputeDeadline, 3000n)).toBe(false)
    expect(isDisputeWindowExpired(1, disputeDeadline, 3001n)).toBe(true)

    // Status 2 (ProofSubmitted)
    expect(isDisputeWindowExpired(2, disputeDeadline, 2999n)).toBe(false)
    expect(isDisputeWindowExpired(2, disputeDeadline, 3000n)).toBe(false)
    expect(isDisputeWindowExpired(2, disputeDeadline, 3001n)).toBe(true)
  })

  it('computes effectiveStatusLabel dynamically based on current timestamp', () => {
    // Offered before expiry -> OFFERED
    expect(effectiveStatusLabel(0, offerExpiry, disputeDeadline, 999n)).toBe('OFFERED')
    // Offered after expiry -> EXPIRED badge
    expect(effectiveStatusLabel(0, offerExpiry, disputeDeadline, 1001n)).toBe('EXPIRED')

    // Active before dispute cutoff -> ACTIVE
    expect(effectiveStatusLabel(1, offerExpiry, disputeDeadline, 2500n)).toBe('ACTIVE')
    // Active after dispute cutoff -> EXPIRED badge
    expect(effectiveStatusLabel(1, offerExpiry, disputeDeadline, 3001n)).toBe('EXPIRED')

    // Proof In before dispute cutoff -> PROOF IN
    expect(effectiveStatusLabel(2, offerExpiry, disputeDeadline, 2500n)).toBe('PROOF IN')
    // Proof In after dispute cutoff -> EXPIRED badge
    expect(effectiveStatusLabel(2, offerExpiry, disputeDeadline, 3001n)).toBe('EXPIRED')

    // Terminal statuses remain fixed
    expect(effectiveStatusLabel(4, offerExpiry, disputeDeadline, 9999n)).toBe('SETTLED')
    expect(effectiveStatusLabel(5, offerExpiry, disputeDeadline, 9999n)).toBe('CANCELLED')
    expect(effectiveStatusLabel(6, offerExpiry, disputeDeadline, 9999n)).toBe('EXPIRED')
  })
})

describe('2. Role Permission & Revert Guards (Pact.sol V1 Rules)', () => {
  it('acceptPact is only callable by designated taker before offerExpiry', () => {
    const pact: MockPact = {
      id: 1, maker: MAKER, taker: TAKER, arbiter: ARBITER,
      tokenMaker: 'USDC', tokenTaker: 'USDC', amountMaker: 100n, amountTaker: 50n,
      collateralMaker: 100n, collateralTaker: 0n, bondAmount: 5n,
      offerExpiry: 1000n, performanceDeadline: 2000n, disputeDeadline: 3000n, status: 0,
    }

    const checkAccept = (caller: string, now: bigint) => {
      if (pact.status !== 0) throw new Error('InvalidStatus')
      if (caller.toLowerCase() !== pact.taker.toLowerCase()) throw new Error('InvalidParty')
      if (now > pact.offerExpiry) throw new Error('TooLate')
      return true
    }

    // Taker before expiry -> OK
    expect(checkAccept(TAKER, 999n)).toBe(true)
    // Maker cannot accept
    expect(() => checkAccept(MAKER, 999n)).toThrow('InvalidParty')
    // Stranger cannot accept
    expect(() => checkAccept(STRANGER, 999n)).toThrow('InvalidParty')
    // Taker after expiry reverts TooLate
    expect(() => checkAccept(TAKER, 1001n)).toThrow('TooLate')
  })

  it('cancelPact is only callable by maker while Offered', () => {
    const checkCancel = (caller: string, status: number) => {
      if (status !== 0) throw new Error('InvalidStatus')
      if (caller.toLowerCase() !== MAKER.toLowerCase()) throw new Error('InvalidParty')
      return true
    }

    expect(checkCancel(MAKER, 0)).toBe(true)
    expect(() => checkCancel(TAKER, 0)).toThrow('InvalidParty')
    expect(() => checkCancel(STRANGER, 0)).toThrow('InvalidParty')
    expect(() => checkCancel(MAKER, 1)).toThrow('InvalidStatus')
  })

  it('expireOffer & refundAfterDeadline are permissionless when timestamp > deadline', () => {
    const checkExpireOffer = (status: number, offerExpiry: bigint, now: bigint) => {
      if (status !== 0) throw new Error('InvalidStatus')
      if (now <= offerExpiry) throw new Error('TooEarly')
      return true
    }

    // Callable by Maker, Taker, Stranger when now > offerExpiry
    expect(checkExpireOffer(0, 1000n, 1001n)).toBe(true)
    expect(() => checkExpireOffer(0, 1000n, 1000n)).toThrow('TooEarly')
  })
})

describe('3. Complete Expired Flow: Expired Offer -> Credit -> Withdraw', () => {
  it('reclaims maker collateral as credits upon offer expiration and permits full withdrawal', () => {
    const sys = createSystem()
    const pact: MockPact = {
      id: 1, maker: MAKER, taker: TAKER, arbiter: ARBITER,
      tokenMaker: 'USDC', tokenTaker: 'USDC', amountMaker: 500n, amountTaker: 0n,
      collateralMaker: 500n, collateralTaker: 0n, bondAmount: 25n,
      offerExpiry: 1000n, performanceDeadline: 2000n, disputeDeadline: 3000n, status: 0,
    }
    sys.pacts[1] = pact

    // 1. Time advances past offerExpiry
    const now = 1001n
    expect(now > pact.offerExpiry).toBe(true)

    // 2. expireOffer(1) is triggered
    expect(pact.status).toBe(0)
    const makerCollateral = pact.collateralMaker
    pact.collateralMaker = 0n
    pact.status = 6 // Status.Expired
    credit(sys, pact.maker, pact.tokenMaker, makerCollateral)

    // Verify pact status is terminal
    expect(pact.status).toBe(6)
    expect(isTerminal(pact.status)).toBe(true)

    // Verify pull-payment credits were allocated
    expect(sys.credits[MAKER]['USDC']).toBe(500n)
    expect(sys.credits[TAKER]?.['USDC'] ?? 0n).toBe(0n)

    // 3. Maker calls withdraw(USDC)
    const withdrawnAmount = withdraw(sys, MAKER, 'USDC')
    expect(withdrawnAmount).toBe(500n)
    expect(sys.credits[MAKER]['USDC']).toBe(0n)

    // 4. Repeated withdraw reverts NoCredit
    expect(() => withdraw(sys, MAKER, 'USDC')).toThrow('NoCredit')
  })
})

describe('4. Complete Expired Flow: Active Pact Without Proof -> refundAfterDeadline -> Maker Credit -> Withdraw', () => {
  it('refunds 100% of collateral to Maker when delivery proof was not submitted and dispute deadline passed', () => {
    const sys = createSystem()
    const pact: MockPact = {
      id: 2, maker: MAKER, taker: TAKER, arbiter: ARBITER,
      tokenMaker: 'USDC', tokenTaker: 'EURC', amountMaker: 1000n, amountTaker: 800n,
      collateralMaker: 1000n, collateralTaker: 800n, bondAmount: 50n,
      offerExpiry: 1000n, performanceDeadline: 2000n, disputeDeadline: 3000n, status: 1, // Active
    }
    sys.pacts[2] = pact

    // Time advances past disputeDeadline with NO proof submitted
    const now = 3001n
    expect(now > pact.disputeDeadline).toBe(true)
    expect(pact.status).toBe(1) // Still Active

    // refundAfterDeadline(2) called on Active state -> Winner is Maker
    const winner = pact.status === 2 ? TAKER : MAKER
    expect(winner).toBe(MAKER)

    const makerCol = pact.collateralMaker
    const takerCol = pact.collateralTaker
    pact.collateralMaker = 0n
    pact.collateralTaker = 0n
    pact.status = 6 // Expired

    credit(sys, winner, pact.tokenMaker, makerCol)
    if (takerCol > 0n) credit(sys, winner, pact.tokenTaker, takerCol)

    // Maker receives both collateral components in credits
    expect(sys.credits[MAKER]['USDC']).toBe(1000n)
    expect(sys.credits[MAKER]['EURC']).toBe(800n)

    // Maker withdraws USDC and EURC
    expect(withdraw(sys, MAKER, 'USDC')).toBe(1000n)
    expect(withdraw(sys, MAKER, 'EURC')).toBe(800n)
    expect(sys.credits[MAKER]['USDC']).toBe(0n)
    expect(sys.credits[MAKER]['EURC']).toBe(0n)
  })
})

describe('5. Complete Expired Flow: Proof Submitted Undisputed -> refundAfterDeadline -> Taker Credit -> Withdraw', () => {
  it('releases 100% of collateral & payment to Taker when proof was anchored and dispute cutoff elapsed', () => {
    const sys = createSystem()
    const pact: MockPact = {
      id: 3, maker: MAKER, taker: TAKER, arbiter: ARBITER,
      tokenMaker: 'USDC', tokenTaker: 'USDC', amountMaker: 2000n, amountTaker: 0n,
      collateralMaker: 2000n, collateralTaker: 0n, bondAmount: 100n,
      offerExpiry: 1000n, performanceDeadline: 2000n, disputeDeadline: 3000n, status: 2, // ProofSubmitted
    }
    sys.pacts[3] = pact

    // Time advances past dispute cutoff (3000n)
    const now = 3001n
    expect(now > pact.disputeDeadline).toBe(true)

    // refundAfterDeadline(3) called on ProofSubmitted state -> Winner is Taker
    const winner = pact.status === 2 ? TAKER : MAKER
    expect(winner).toBe(TAKER)

    const makerCol = pact.collateralMaker
    pact.collateralMaker = 0n
    pact.status = 6 // Expired

    credit(sys, winner, pact.tokenMaker, makerCol)

    // Taker receives payout in credits
    expect(sys.credits[TAKER]['USDC']).toBe(2000n)
    expect(withdraw(sys, TAKER, 'USDC')).toBe(2000n)
    expect(sys.credits[TAKER]['USDC']).toBe(0n)
  })
})

describe('6. Complete Dispute Timeout Flow: Unanswered Dispute -> Default Judgment', () => {
  it('awards full bond refund and all collateral to Opener when Respondent misses response deadline', () => {
    const sys = createSystem()
    const pact: MockPact = {
      id: 4, maker: MAKER, taker: TAKER, arbiter: ARBITER,
      tokenMaker: 'USDC', tokenTaker: 'USDC', amountMaker: 1000n, amountTaker: 0n,
      collateralMaker: 1000n, collateralTaker: 0n, bondAmount: 50n,
      offerExpiry: 1000n, performanceDeadline: 2000n, disputeDeadline: 3000n, status: 3, // Disputed
    }
    const dispute: MockDispute = {
      opener: MAKER,
      claim: 1, // Maker Claim
      makerBond: 50n,
      takerBond: 0n,
      responseDeadline: 2500n,
      arbiterDeadline: 0n, // Unanswered
    }
    sys.pacts[4] = pact
    sys.disputes[4] = dispute

    // Time passes responseDeadline (2500n)
    const now = 2501n
    expect(now > dispute.responseDeadline).toBe(true)
    expect(dispute.arbiterDeadline).toBe(0n)

    // resolveUnansweredDispute(4)
    const winner = dispute.claim === 1 ? MAKER : TAKER
    const totalBonds = dispute.makerBond + dispute.takerBond
    dispute.makerBond = 0n
    dispute.takerBond = 0n

    // Bond refund to winner
    credit(sys, winner, 'USDC', totalBonds)
    // Collateral to winner
    const makerCol = pact.collateralMaker
    pact.collateralMaker = 0n
    pact.status = 4 // Settled
    credit(sys, winner, pact.tokenMaker, makerCol)

    // Opener (Maker) received 50 USDC bond refund + 1000 USDC collateral = 1050 USDC
    expect(sys.credits[MAKER]['USDC']).toBe(1050n)
    expect(withdraw(sys, MAKER, 'USDC')).toBe(1050n)
    expect(sys.credits[MAKER]['USDC']).toBe(0n)
  })
})

describe('7. Complete Arbiter Timeout Flow: 14-Day Inaction -> 50/50 Split & Bond Refunds', () => {
  it('refunds both dispute bonds and splits collateral 50/50 when Arbiter times out', () => {
    const sys = createSystem()
    const pact: MockPact = {
      id: 5, maker: MAKER, taker: TAKER, arbiter: ARBITER,
      tokenMaker: 'USDC', tokenTaker: 'USDC', amountMaker: 1000n, amountTaker: 0n,
      collateralMaker: 1000n, collateralTaker: 0n, bondAmount: 50n,
      offerExpiry: 1000n, performanceDeadline: 2000n, disputeDeadline: 3000n, status: 3, // Disputed
    }
    const dispute: MockDispute = {
      opener: MAKER,
      claim: 1,
      makerBond: 50n,
      takerBond: 50n,
      responseDeadline: 2500n,
      arbiterDeadline: 3500n, // Both bonded
    }
    sys.pacts[5] = pact
    sys.disputes[5] = dispute

    // Time passes arbiterDeadline (3500n)
    const now = 3501n
    expect(now > dispute.arbiterDeadline).toBe(true)

    // arbiterTimeout(5)
    // 1. Refund bonds
    credit(sys, MAKER, 'USDC', dispute.makerBond)
    credit(sys, TAKER, 'USDC', dispute.takerBond)
    dispute.makerBond = 0n
    dispute.takerBond = 0n

    // 2. Split collateral 50/50
    const totalCol = pact.collateralMaker
    pact.collateralMaker = 0n
    const takerHalf = totalCol / 2n
    const makerHalf = totalCol - takerHalf
    credit(sys, TAKER, pact.tokenMaker, takerHalf)
    credit(sys, MAKER, pact.tokenMaker, makerHalf)
    pact.status = 4 // Settled

    // Both parties have their 50 USDC bond refunded + 500 USDC collateral share = 550 USDC
    expect(sys.credits[MAKER]['USDC']).toBe(550n)
    expect(sys.credits[TAKER]['USDC']).toBe(550n)

    expect(withdraw(sys, MAKER, 'USDC')).toBe(550n)
    expect(withdraw(sys, TAKER, 'USDC')).toBe(550n)
  })
})
