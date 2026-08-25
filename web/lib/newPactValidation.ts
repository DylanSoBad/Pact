import { isAddress } from 'viem'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DECIMAL_INPUT = /^(?:\d+|\d+\.\d{1,6}|\.\d{1,6})$/
const POSITIVE_INTEGER = /^\d+$/

export const NEW_PACT_FIELD_ORDER = [
  'taker',
  'arbiter',
  'amountMaker',
  'amountTaker',
  'notionalUSDC',
  'arbiterFeeCap',
  'offerHours',
  'performanceDays',
  'disputeDays',
  'terms',
] as const

export type NewPactField = (typeof NEW_PACT_FIELD_ORDER)[number]
export type NewPactFieldErrors = Partial<Record<NewPactField, string>>

export type NewPactValidationInput = {
  makerAddress?: string
  isConnected: boolean
  makerBalanceKnown: boolean
  taker: string
  arbiter: string
  amountMaker: string
  amountTaker: string
  notionalUSDC: string
  arbiterFeeCap: string
  offerHours: string
  performanceDays: string
  disputeDays: string
  terms: string
  makerAmount: bigint
  makerBalance: bigint
  notionalAmount: bigint
  feeCapAmount: bigint
  calculatedBond: bigint
}

function isDecimal(value: string): boolean {
  return DECIMAL_INPUT.test(value.trim())
}

function isPositiveInteger(value: string): boolean {
  const trimmed = value.trim()
  const parsed = Number(trimmed)
  return POSITIVE_INTEGER.test(trimmed) && Number.isSafeInteger(parsed) && parsed > 0
}

export function validateNewPactForm(input: NewPactValidationInput): NewPactFieldErrors {
  const errors: NewPactFieldErrors = {}
  const takerValid = isAddress(input.taker) && input.taker.toLowerCase() !== ZERO_ADDRESS
  const arbiterValid = isAddress(input.arbiter) && input.arbiter.toLowerCase() !== ZERO_ADDRESS

  if (!takerValid) errors.taker = 'Enter a valid counterparty wallet address.'
  if (!arbiterValid) errors.arbiter = 'Enter a valid arbiter wallet address.'

  if (takerValid && input.makerAddress && input.taker.toLowerCase() === input.makerAddress.toLowerCase()) {
    errors.taker = 'Counterparty must be different from the maker.'
  }
  if (arbiterValid && input.makerAddress && input.arbiter.toLowerCase() === input.makerAddress.toLowerCase()) {
    errors.arbiter = 'Arbiter must be different from the maker.'
  }
  if (takerValid && arbiterValid && input.taker.toLowerCase() === input.arbiter.toLowerCase()) {
    errors.taker = 'Counterparty and arbiter must use different addresses.'
    errors.arbiter = 'Arbiter and counterparty must use different addresses.'
  }

  if (!isDecimal(input.amountMaker) || input.makerAmount <= 0n) {
    errors.amountMaker = 'Maker collateral must be a number greater than zero.'
  } else if (input.isConnected && input.makerBalanceKnown && input.makerAmount > input.makerBalance) {
    errors.amountMaker = 'Maker wallet does not have enough collateral.'
  }

  if (input.amountTaker.trim() && !isDecimal(input.amountTaker)) {
    errors.amountTaker = 'Counterparty collateral must be a valid non-negative number.'
  }

  if (!isDecimal(input.notionalUSDC) || input.notionalAmount <= 0n) {
    errors.notionalUSDC = 'Notional value must be a number greater than zero.'
  }

  if (!isDecimal(input.arbiterFeeCap)) {
    errors.arbiterFeeCap = 'Arbiter fee cap must be a valid non-negative number.'
  } else if (input.feeCapAmount > input.calculatedBond) {
    errors.arbiterFeeCap = 'Arbiter fee cap cannot exceed the dispute bond.'
  }

  if (!isPositiveInteger(input.offerHours)) errors.offerHours = 'Offer expiry must be a positive whole number.'
  if (!isPositiveInteger(input.performanceDays)) errors.performanceDays = 'Performance window must be a positive whole number.'
  if (!isPositiveInteger(input.disputeDays)) errors.disputeDays = 'Dispute window must be a positive whole number.'
  if (!input.terms.trim()) errors.terms = 'Written agreement terms are required.'

  return errors
}
