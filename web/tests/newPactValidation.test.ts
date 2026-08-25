import { describe, expect, it } from 'vitest'
import { validateNewPactForm, type NewPactValidationInput } from '../lib/newPactValidation'

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

  it('maps missing values to their exact fields', () => {
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

    expect(errors).toMatchObject({
      taker: expect.any(String),
      arbiter: expect.any(String),
      amountMaker: expect.any(String),
      notionalUSDC: expect.any(String),
      offerHours: expect.any(String),
      terms: expect.any(String),
    })
  })

  it('marks conflicting roles on both affected address fields', () => {
    const errors = validateNewPactForm(validInput({ taker: arbiter }))
    expect(errors.taker).toContain('different')
    expect(errors.arbiter).toContain('different')
  })

  it('rejects malformed optional collateral, insufficient balance and excessive fee', () => {
    const errors = validateNewPactForm(validInput({
      amountTaker: 'not-a-number',
      makerAmount: 12_000_000n,
      feeCapAmount: 1_000_001n,
    }))
    expect(errors.amountTaker).toBeTruthy()
    expect(errors.amountMaker).toContain('enough')
    expect(errors.arbiterFeeCap).toContain('exceed')
  })
})
