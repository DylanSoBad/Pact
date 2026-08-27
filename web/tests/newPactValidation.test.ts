import { describe, expect, it } from 'vitest'
import {
  validateNewPactForm,
  getStepFields,
  isStepValid,
  getFirstInvalidFieldForStep,
  ZERO_ADDRESS,
  type NewPactValidationInput,
} from '../lib/newPactValidation'

const maker = '0x1111111111111111111111111111111111111111'
const taker = '0x2222222222222222222222222222222222222222'
const arbiter = '0x3333333333333333333333333333333333333333'

function validInput(overrides: Partial<NewPactValidationInput> = {}): NewPactValidationInput {
  return {
    makerAddress: maker,
    isConnected: true,
    makerBalanceKnown: true,
    taker,
    arbiter,
    amountMaker: '2',
    amountTaker: '3',
    notionalUSDC: '20',
    arbiterFeeCap: '1',
    offerHours: '24',
    performanceDays: '7',
    disputeDays: '3',
    terms: 'Deliver the agreed hardware with a verifiable tracking reference.',
    makerAmount: 2_000_000n,
    makerBalance: 10_000_000n,
    notionalAmount: 20_000_000n,
    feeCapAmount: 1_000_000n,
    calculatedBond: 1_000_000n,
    ...overrides,
  }
}

describe('validateNewPactForm', () => {
  it('accepts a complete valid pact', () => {
    expect(validateNewPactForm(validInput())).toEqual({})
  })

  it('maps missing values to their exact fields with actionable messages', () => {
    const errors = validateNewPactForm(validInput({
      taker: '',
      arbiter: '',
      amountMaker: '',
      makerAmount: 0n,
      notionalUSDC: '',
      notionalAmount: 0n,
      offerHours: '0',
      terms: ' ',
    }))

    expect(errors.taker).toContain('Counterparty address is required')
    expect(errors.arbiter).toContain('Designated arbiter address is required')
    expect(errors.amountMaker).toContain('Maker collateral is required')
    expect(errors.notionalUSDC).toContain('Notional valuation is required')
    expect(errors.offerHours).toContain('positive whole number')
    expect(errors.terms).toContain('Written agreement terms are required')
  })

  it('rejects zero address as counterparty or arbiter', () => {
    const errors = validateNewPactForm(validInput({
      taker: ZERO_ADDRESS,
      arbiter: ZERO_ADDRESS,
    }))
    expect(errors.taker).toContain('Zero address')
    expect(errors.arbiter).toContain('Zero address')
  })

  it('rejects setting Maker as counterparty or arbiter', () => {
    const errors = validateNewPactForm(validInput({
      taker: maker,
      arbiter: maker,
    }))
    expect(errors.taker).toContain('cannot be your own Maker address')
    expect(errors.arbiter).toContain('cannot be your own Maker address')
  })

  it('marks conflicting roles when counterparty and arbiter match', () => {
    const errors = validateNewPactForm(validInput({ taker: arbiter }))
    expect(errors.arbiter).toContain('cannot be the same address')
    expect(errors.taker).toContain('distinct addresses')
  })

  it('rejects insufficient balance and fee cap exceeding dispute bond', () => {
    const errors = validateNewPactForm(validInput({
      amountTaker: 'invalid_amount',
      makerAmount: 12_000_000n,
      makerBalance: 10_000_000n,
      feeCapAmount: 2_000_000n,
      calculatedBond: 1_000_000n,
    }))
    expect(errors.amountTaker).toBeTruthy()
    expect(errors.amountMaker).toContain('Insufficient wallet balance')
    expect(errors.arbiterFeeCap).toContain('cannot exceed')
  })

  it('rejects terms that are too short (< 10 characters)', () => {
    const errors = validateNewPactForm(validInput({ terms: 'Short' }))
    expect(errors.terms).toContain('too short')
  })

  it('rejects deadline values out of bounds', () => {
    const errors = validateNewPactForm(validInput({
      offerHours: '1000',
      performanceDays: '500',
      disputeDays: '120',
    }))
    expect(errors.offerHours).toContain('720 hours')
    expect(errors.performanceDays).toContain('365 days')
    expect(errors.disputeDays).toContain('90 days')
  })
})

describe('Step Validation Helpers', () => {
  it('returns correct fields for each step', () => {
    expect(getStepFields(1)).toEqual(['taker', 'arbiter'])
    expect(getStepFields(2)).toEqual(['amountMaker', 'amountTaker', 'notionalUSDC', 'arbiterFeeCap'])
    expect(getStepFields(3)).toEqual(['terms', 'offerHours', 'performanceDays', 'disputeDays'])
  })

  it('accurately identifies whether a step is valid', () => {
    const allValidErrors = validateNewPactForm(validInput())
    expect(isStepValid(1, allValidErrors)).toBe(true)
    expect(isStepValid(2, allValidErrors)).toBe(true)
    expect(isStepValid(3, allValidErrors)).toBe(true)

    const step1Errors = validateNewPactForm(validInput({ taker: '' }))
    expect(isStepValid(1, step1Errors)).toBe(false)
    expect(getFirstInvalidFieldForStep(1, step1Errors)).toBe('taker')
    expect(isStepValid(2, step1Errors)).toBe(true)
  })
})
