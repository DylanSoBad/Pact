import { describe, expect, it } from 'vitest'
import { evaluatePactActions, getPrimaryUserAction, type DisputeData } from '../lib/actionMatrix'
import type { PactData } from '../lib/reads'

const MAKER = '0x1111111111111111111111111111111111111111'
const TAKER = '0x2222222222222222222222222222222222222222'
const ARBITER = '0x3333333333333333333333333333333333333333'
const OBSERVER = '0x9999999999999999999999999999999999999999'

function mockPact(status: number, overrides?: Partial<PactData>): PactData {
  return {
    id: 101,
    maker: MAKER,
    taker: TAKER,
    arbiter: ARBITER,
    tokenMaker: '0x0000000000000000000000000000000000000001',
    tokenTaker: '0x0000000000000000000000000000000000000002',
    amountMaker: 1000000000n, // 1,000 USDC
    amountTaker: 500000000n,  // 500 EURC
    collateralMaker: 1000000000n,
    collateralTaker: 500000000n,
    notionalUSDC: 1000000000n,
    bondAmount: 50000000n, // 50 USDC (5%)
    arbiterFeeCap: 25000000n, // 25 USDC
    offerExpiry: 1000n,
    performanceDeadline: 2000n,
    disputeDeadline: 3000n,
    createdAt: 100n,
    updatedAt: 100n,
    kind: 0,
    status,
    blurSize: false,
    termsHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    proofHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    deadline: 3000n,
    ...overrides,
  }
}

function mockDispute(overrides?: Partial<DisputeData>): DisputeData {
  return {
    opener: MAKER as `0x${string}`,
    claim: 1, // 1: Maker claim
    makerBond: 50000000n,
    takerBond: 0n,
    openedAt: 1500n,
    responseDeadline: 2500n,
    arbiterDeadline: 0n, // 0 = awaiting counterparty bond
    ...overrides,
  }
}

describe('Role × State Action Matrix Unit Tests', () => {
  // ---------------------------------------------------------------------------
  // STATUS 0: OFFERED
  // ---------------------------------------------------------------------------
  describe('Status 0: OFFERED', () => {
    it('Maker before offerExpiry can cancel offer', () => {
      const pact = mockPact(0)
      const actions = evaluatePactActions(pact, null, MAKER, 500n)
      const cancelAction = actions.find(a => a.type === 'CANCEL_OFFER')

      expect(cancelAction).toBeDefined()
      expect(cancelAction?.isEligible).toBe(true)
      expect(cancelAction?.isDangerous).toBe(true)
      expect(cancelAction?.functionName).toBe('cancelPact')
    })

    it('Taker before offerExpiry needs verified terms to accept', () => {
      const pact = mockPact(0)
      
      // Without terms match
      const unverified = evaluatePactActions(pact, null, TAKER, 500n, { termsMatched: false })
      const acceptUnverified = unverified.find(a => a.type === 'ACCEPT_OFFER')
      expect(acceptUnverified?.isEligible).toBe(false)
      expect(acceptUnverified?.disabledReason).toContain('Paste matching plaintext agreement terms')

      // With terms match
      const verified = evaluatePactActions(pact, null, TAKER, 500n, { termsMatched: true })
      const acceptVerified = verified.find(a => a.type === 'ACCEPT_OFFER')
      expect(acceptVerified?.isEligible).toBe(true)
      expect(acceptVerified?.disabledReason).toBeUndefined()
    })

    it('Observer cannot cancel or accept offered pact', () => {
      const pact = mockPact(0)
      const actions = evaluatePactActions(pact, null, OBSERVER, 500n)
      const acceptAction = actions.find(a => a.type === 'ACCEPT_OFFER')
      const cancelAction = actions.find(a => a.type === 'CANCEL_OFFER')

      expect(acceptAction?.isEligible).toBe(false)
      expect(acceptAction?.disabledReason).toContain('Only designated counterparty')
      expect(cancelAction?.isEligible).toBe(false)
      expect(cancelAction?.disabledReason).toContain('Only the maker')
    })

    it('When offer expires (now > offerExpiry), expireOffer is active for Maker and Public', () => {
      const pact = mockPact(0)
      const makerActions = evaluatePactActions(pact, null, MAKER, 1001n)
      const expireAction = makerActions.find(a => a.type === 'EXPIRE_OFFER')
      expect(expireAction?.isEligible).toBe(true)
      expect(expireAction?.role).toBe('MAKER')

      const primary = getPrimaryUserAction(pact, null, MAKER, 1001n)
      expect(primary?.type).toBe('EXPIRE_OFFER')
    })
  })

  // ---------------------------------------------------------------------------
  // STATUS 1: ACTIVE
  // ---------------------------------------------------------------------------
  describe('Status 1: ACTIVE (Collateral Locked)', () => {
    it('Taker within performance window can submit proof with valid input', () => {
      const pact = mockPact(1)
      
      // No proof input
      const noInput = evaluatePactActions(pact, null, TAKER, 1500n, { hasProofInput: false })
      const proofNoInput = noInput.find(a => a.type === 'SUBMIT_PROOF')
      expect(proofNoInput?.isEligible).toBe(false)
      expect(proofNoInput?.disabledReason).toContain('Enter deliverable link')

      // With proof input
      const withInput = evaluatePactActions(pact, null, TAKER, 1500n, { hasProofInput: true })
      const proofWithInput = withInput.find(a => a.type === 'SUBMIT_PROOF')
      expect(proofWithInput?.isEligible).toBe(true)
      expect(proofWithInput?.functionName).toBe('submitProof')
    })

    it('Maker within dispute window can release collateral early or open dispute', () => {
      const pact = mockPact(1)
      const actions = evaluatePactActions(pact, null, MAKER, 1500n)
      
      const releaseAction = actions.find(a => a.type === 'RELEASE_COLLATERAL')
      expect(releaseAction?.isEligible).toBe(true)
      expect(releaseAction?.functionName).toBe('release')
      expect(releaseAction?.isDangerous).toBe(true)

      const disputeAction = actions.find(a => a.type === 'OPEN_DISPUTE')
      expect(disputeAction?.isEligible).toBe(true)
      expect(disputeAction?.financialSummary.bondAmount).toBe(pact.bondAmount)
    })

    it('Taker after performance deadline cannot submit proof but can open dispute', () => {
      const pact = mockPact(1)
      // now = 2500n (past performanceDeadline 2000n, but before disputeDeadline 3000n)
      const actions = evaluatePactActions(pact, null, TAKER, 2500n)
      
      const submitProof = actions.find(a => a.type === 'SUBMIT_PROOF')
      expect(submitProof).toBeUndefined()

      const disputeAction = actions.find(a => a.type === 'OPEN_DISPUTE')
      expect(disputeAction?.isEligible).toBe(true)
    })

    it('After dispute deadline (no proof submitted), 100% reverts to Maker via deadline refund', () => {
      const pact = mockPact(1)
      // now = 3001n (past disputeDeadline 3000n)
      const actions = evaluatePactActions(pact, null, MAKER, 3001n)
      const refundAction = actions.find(a => a.type === 'DEADLINE_REFUND_MAKER')

      expect(refundAction?.isEligible).toBe(true)
      expect(refundAction?.functionName).toBe('refundAfterDeadline')
      expect(refundAction?.financialSummary.recipientRole).toBe('Maker (100% Refund)')
    })
  })

  // ---------------------------------------------------------------------------
  // STATUS 2: PROOF SUBMITTED
  // ---------------------------------------------------------------------------
  describe('Status 2: PROOF SUBMITTED', () => {
    it('Maker within dispute window can review proof and release or contest via dispute', () => {
      const pact = mockPact(2)
      const actions = evaluatePactActions(pact, null, MAKER, 2500n)

      const releaseAction = actions.find(a => a.type === 'RELEASE_COLLATERAL')
      expect(releaseAction?.isEligible).toBe(true)
      expect(releaseAction?.label).toContain('Review Proof & Release Collateral')

      const disputeAction = actions.find(a => a.type === 'OPEN_DISPUTE')
      expect(disputeAction?.isEligible).toBe(true)
    })

    it('After dispute deadline (proof unchallenged), Taker claims 100% payout', () => {
      const pact = mockPact(2)
      // now = 3001n
      const takerActions = evaluatePactActions(pact, null, TAKER, 3001n)
      const settleAction = takerActions.find(a => a.type === 'DEADLINE_SETTLE_TAKER')

      expect(settleAction?.isEligible).toBe(true)
      expect(settleAction?.functionName).toBe('refundAfterDeadline')
      expect(settleAction?.financialSummary.recipientRole).toBe('Counterparty (100% Payout)')
    })
  })

  // ---------------------------------------------------------------------------
  // STATUS 3: DISPUTED
  // ---------------------------------------------------------------------------
  describe('Status 3: DISPUTED', () => {
    it('Unanswered dispute before response cutoff prompts Respondent to post counter-bond', () => {
      const pact = mockPact(3)
      const dispute = mockDispute({ opener: MAKER as `0x${string}`, responseDeadline: 2500n, arbiterDeadline: 0n })

      // Respondent is TAKER
      const takerActions = evaluatePactActions(pact, dispute, TAKER, 2000n)
      const respondAction = takerActions.find(a => a.type === 'RESPOND_DISPUTE')
      expect(respondAction?.isEligible).toBe(true)
      expect(respondAction?.financialSummary.bondAmount).toBe(pact.bondAmount)

      // Opener (MAKER) cannot respond to their own dispute
      const makerActions = evaluatePactActions(pact, dispute, MAKER, 2000n)
      const makerRespond = makerActions.find(a => a.type === 'RESPOND_DISPUTE')
      expect(makerRespond?.isEligible).toBe(false)
      expect(makerRespond?.disabledReason).toContain('You already opened this dispute')
    })

    it('Unanswered dispute after response cutoff allows Opener to execute default judgment', () => {
      const pact = mockPact(3)
      const dispute = mockDispute({ opener: MAKER as `0x${string}`, responseDeadline: 2500n, arbiterDeadline: 0n })

      // now = 2501n (past responseDeadline)
      const makerActions = evaluatePactActions(pact, dispute, MAKER, 2501n)
      const defaultAction = makerActions.find(a => a.type === 'DEFAULT_JUDGMENT')
      expect(defaultAction?.isEligible).toBe(true)
      expect(defaultAction?.functionName).toBe('resolveUnansweredDispute')
    })

    it('Both bonded within arbiter window allows Arbiter to rule for Maker or Taker', () => {
      const pact = mockPact(3)
      const dispute = mockDispute({
        opener: MAKER as `0x${string}`,
        makerBond: 50000000n,
        takerBond: 50000000n,
        arbiterDeadline: 3500n,
      })

      const arbiterActions = evaluatePactActions(pact, dispute, ARBITER, 3000n)
      const ruleMaker = arbiterActions.find(a => a.type === 'RULE_DISPUTE_MAKER')
      const ruleTaker = arbiterActions.find(a => a.type === 'RULE_DISPUTE_TAKER')

      expect(ruleMaker?.isEligible).toBe(true)
      expect(ruleTaker?.isEligible).toBe(true)
      expect(ruleMaker?.functionName).toBe('ruleDispute')
    })

    it('Both bonded after arbiter deadline (14 days timeout) allows executing arbiterTimeout', () => {
      const pact = mockPact(3)
      const dispute = mockDispute({
        opener: MAKER as `0x${string}`,
        makerBond: 50000000n,
        takerBond: 50000000n,
        arbiterDeadline: 3500n,
      })

      // now = 3501n
      const makerActions = evaluatePactActions(pact, dispute, MAKER, 3501n)
      const timeoutAction = makerActions.find(a => a.type === 'ARBITER_TIMEOUT')

      expect(timeoutAction?.isEligible).toBe(true)
      expect(timeoutAction?.functionName).toBe('arbiterTimeout')
    })
  })

  // ---------------------------------------------------------------------------
  // Disconnected & Missing Prerequisites Checks
  // ---------------------------------------------------------------------------
  describe('Disconnected & Anti-Revert Guidance', () => {
    it('When disconnected (undefined address), actions explain to connect wallet', () => {
      const pact = mockPact(0)
      const actions = evaluatePactActions(pact, null, undefined, 500n)
      const acceptAction = actions.find(a => a.type === 'ACCEPT_OFFER')
      const cancelAction = actions.find(a => a.type === 'CANCEL_OFFER')

      expect(acceptAction?.isEligible).toBe(false)
      expect(acceptAction?.disabledReason).toBe('Connect wallet as counterparty to accept this offer.')
      expect(cancelAction?.isEligible).toBe(false)
      expect(cancelAction?.disabledReason).toBe('Connect wallet as maker to cancel offer.')
    })

    it('getPrimaryUserAction returns null when disconnected', () => {
      const pact = mockPact(0)
      expect(getPrimaryUserAction(pact, null, undefined, 500n)).toBeNull()
    })
  })
})
