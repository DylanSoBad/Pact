import { describe, expect, it } from 'vitest'
import { transactionErrorMessage } from '../lib/transactionErrors'

describe('transactionErrorMessage', () => {
  it('turns wallet rejection into a safe retry message', () => {
    expect(transactionErrorMessage(new Error('User rejected the request'))).toContain('No on-chain change')
  })

  it('explains stale pact state', () => {
    expect(transactionErrorMessage(new Error('execution reverted: InvalidStatus'))).toContain('state changed')
  })

  it('bounds unknown wallet messages', () => {
    expect(transactionErrorMessage(new Error('x'.repeat(500))).length).toBeLessThanOrEqual(240)
  })
})
