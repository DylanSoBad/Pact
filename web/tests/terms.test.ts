import { describe, expect, it } from 'vitest'
import { hashPactTerms, hashTerms } from '../lib/terms'

describe('canonical pact terms', () => {
  it('pins the UTF-8 document hash', () => {
    expect(hashTerms('Exact terms')).toBe('0xbd6d15f054cabc00adb2a83df9ded0e0ea7ae602b8badb9cbc4fa79b707d7fbb')
  })

  it('binds every economic field using Solidity ABI encoding', () => {
    expect(hashPactTerms({
      chainId: 5_042_002n,
      pactAddress: '0x1111111111111111111111111111111111111111',
      maker: '0x2222222222222222222222222222222222222222',
      taker: '0x3333333333333333333333333333333333333333',
      arbiter: '0x4444444444444444444444444444444444444444',
      tokenMaker: '0x3600000000000000000000000000000000000000',
      tokenTaker: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
      amountMaker: 1_000_001n,
      amountTaker: 2_000_002n,
      notionalUSDC: 3_000_003n,
      arbiterFeeCap: 1_000_000n,
      offerExpiry: 1_800_000_000n,
      performanceDeadline: 1_800_100_000n,
      disputeDeadline: 1_800_200_000n,
      kind: 0,
      blurSize: false,
    }, 'Exact terms')).toBe('0x28db992e44d2e1c65a653a5fa1e3718a42a923da22b5ab416b92d397652cefe2')
  })
})
