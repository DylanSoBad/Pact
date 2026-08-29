import { isAddress } from 'viem'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DECIMAL_INPUT = /^(?:\d+|\d+\.\d{1,6}|\.\d{1,6})$/
const POSITIVE_INTEGER = /^\d+$/

export const PARTIES_FIELDS = ['taker', 'arbiter'] as const
export const COLLATERAL_FIELDS = ['amountMaker', 'amountTaker', 'notionalUSDC', 'arbiterFeeCap'] as const
export const TERMS_DEADLINES_FIELDS = ['terms', 'offerHours', 'performanceDays', 'disputeDays'] as const

export const NEW_PACT_FIELD_ORDER = [
  ...PARTIES_FIELDS,
  ...COLLATERAL_FIELDS,
  ...TERMS_DEADLINES_FIELDS,
] as const

export type NewPactField = (typeof NEW_PACT_FIELD_ORDER)[number]
export type NewPactFieldErrors = Partial<Record<NewPactField, string>>

export type FormStep = 1 | 2 | 3 | 4

export type NewPactValidationInput = {
  makerAddress?: string
  isConnected: boolean
  makerBalanceKnown: boolean
  taker: string
  arbiter: string
  isCustomArbiter?: boolean
  customArbiterAcknowledged?: boolean
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

  // 1. Counterparty (Taker) Validation
  const trimmedTaker = input.taker.trim()
  if (!trimmedTaker) {
    errors.taker = 'Counterparty address is required so the smart contract knows who is authorized to accept and fulfill this agreement.'
  } else if (!isAddress(trimmedTaker)) {
    errors.taker = 'Invalid address format. Enter a valid EVM address starting with 0x (42 characters).'
  } else if (trimmedTaker.toLowerCase() === ZERO_ADDRESS) {
    errors.taker = 'Zero address (0x000...0000) cannot be designated as counterparty.'
  } else if (input.makerAddress && trimmedTaker.toLowerCase() === input.makerAddress.toLowerCase()) {
    errors.taker = 'Counterparty cannot be your own Maker address. Enter a distinct counterparty address.'
  }

  // 2. Arbiter Validation
  const trimmedArbiter = input.arbiter.trim()
  if (!trimmedArbiter) {
    errors.arbiter = 'Designated arbiter address is required to resolve disputes if performance is contested.'
  } else if (!isAddress(trimmedArbiter)) {
    errors.arbiter = 'Invalid address format. Enter a valid EVM address starting with 0x (42 characters).'
  } else if (trimmedArbiter.toLowerCase() === ZERO_ADDRESS) {
    errors.arbiter = 'Zero address (0x000...0000) cannot be designated as arbiter.'
  } else if (input.makerAddress && trimmedArbiter.toLowerCase() === input.makerAddress.toLowerCase()) {
    errors.arbiter = 'Arbiter cannot be your own Maker address. Designate a neutral third party.'
  } else if (
    isAddress(trimmedTaker) &&
    trimmedTaker.toLowerCase() !== ZERO_ADDRESS &&
    trimmedTaker.toLowerCase() === trimmedArbiter.toLowerCase()
  ) {
    errors.arbiter = 'Arbiter cannot be the same address as the Counterparty.'
    if (!errors.taker) {
      errors.taker = 'Counterparty and Arbiter must use distinct addresses.'
    }
  } else if (input.isCustomArbiter && input.customArbiterAcknowledged === false) {
    errors.arbiter = 'Please acknowledge the Custom Arbiter risk notice before proceeding.'
  }

  // 3. Maker Collateral Validation
  const trimmedMakerAmt = input.amountMaker.trim()
  if (!trimmedMakerAmt) {
    errors.amountMaker = 'Maker collateral is required as the locked escrow payment backing this commitment.'
  } else if (!isDecimal(trimmedMakerAmt) || input.makerAmount <= 0n) {
    errors.amountMaker = 'Maker collateral must be a positive decimal number greater than 0 (e.g. 100 or 25.50).'
  } else if (input.isConnected && input.makerBalanceKnown && input.makerAmount > input.makerBalance) {
    errors.amountMaker = 'Insufficient wallet balance for this collateral amount.'
  }

  // 4. Counterparty (Taker) Collateral Validation
  if (input.amountTaker.trim() && (!isDecimal(input.amountTaker) || Number(input.amountTaker) < 0)) {
    errors.amountTaker = 'Counterparty collateral must be a valid non-negative number (0 or greater).'
  }

  // 5. Notional Valuation Validation
  const trimmedNotional = input.notionalUSDC.trim()
  if (!trimmedNotional) {
    errors.notionalUSDC = 'Notional valuation is required to calculate the standard 5% dispute bond (min 1 USDC).'
  } else if (!isDecimal(trimmedNotional) || input.notionalAmount <= 0n) {
    errors.notionalUSDC = 'Notional valuation must be a positive decimal number in USDC terms (e.g. 1000).'
  }

  // 6. Arbiter Fee Cap Validation
  const trimmedFeeCap = input.arbiterFeeCap.trim()
  if (!trimmedFeeCap || !isDecimal(trimmedFeeCap) || Number(trimmedFeeCap) < 0) {
    errors.arbiterFeeCap = 'Arbiter fee cap must be a valid non-negative number.'
  } else if (input.feeCapAmount > input.calculatedBond) {
    errors.arbiterFeeCap = 'Arbiter fee cap cannot exceed the 5% dispute bond amount committed to the pact.'
  }

  // 7. Deadlines & Window Ordering Validation
  const trimmedOffer = input.offerHours.trim()
  if (!trimmedOffer || !isPositiveInteger(trimmedOffer)) {
    errors.offerHours = 'Offer expiry window must be a positive whole number of hours (min 1).'
  } else {
    const hours = Number(trimmedOffer)
    if (hours < 1 || hours > 720) {
      errors.offerHours = 'Offer expiry must be between 1 hour and 720 hours (30 days).'
    }
  }

  const trimmedPerf = input.performanceDays.trim()
  if (!trimmedPerf || !isPositiveInteger(trimmedPerf)) {
    errors.performanceDays = 'Performance window must be a positive whole number of days (min 1).'
  } else {
    const days = Number(trimmedPerf)
    if (days < 1 || days > 365) {
      errors.performanceDays = 'Performance window must be between 1 and 365 days.'
    }
  }

  const trimmedDispute = input.disputeDays.trim()
  if (!trimmedDispute || !isPositiveInteger(trimmedDispute)) {
    errors.disputeDays = 'Dispute review window must be a positive whole number of days (min 1).'
  } else {
    const days = Number(trimmedDispute)
    if (days < 1 || days > 90) {
      errors.disputeDays = 'Dispute review window must be between 1 and 90 days.'
    }
  }

  // 8. Written Terms Validation
  if (!input.terms.trim()) {
    errors.terms = 'Written agreement terms are required to commit the cryptographic hash on-chain.'
  } else if (input.terms.trim().length < 10) {
    errors.terms = 'Agreement terms are too short. Enter clear terms and verifiable deliverables (at least 10 characters).'
  }

  return errors
}

export function getStepFields(step: FormStep): readonly NewPactField[] {
  switch (step) {
    case 1: return PARTIES_FIELDS
    case 2: return COLLATERAL_FIELDS
    case 3: return TERMS_DEADLINES_FIELDS
    case 4: return NEW_PACT_FIELD_ORDER
  }
}

export function getFirstInvalidFieldForStep(step: FormStep, errors: NewPactFieldErrors): NewPactField | undefined {
  const fields = getStepFields(step)
  return fields.find(field => Boolean(errors[field]))
}

export function isStepValid(step: FormStep, errors: NewPactFieldErrors): boolean {
  const fields = getStepFields(step)
  return !fields.some(field => Boolean(errors[field]))
}
