import { describe, expect, it } from 'vitest'
import { hashPactTerms, hashTerms, verifyPactTerms, CanonicalPactTerms } from '../lib/terms'

describe('canonical pact terms & security verifier', () => {
  const baseCanonicalPact: CanonicalPactTerms = {
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
  }

  const validPlaintext = 'Deliver 50 specialized engineering assets before deadline.'
  const expectedHash = hashPactTerms(baseCanonicalPact, validPlaintext)

  it('pins the UTF-8 document hash', () => {
    expect(hashTerms('Exact terms')).toBe('0xbd6d15f054cabc00adb2a83df9ded0e0ea7ae602b8badb9cbc4fa79b707d7fbb')
  })

  it('binds every economic field using Solidity ABI encoding', () => {
    expect(expectedHash).toBeDefined()
    expect(expectedHash.startsWith('0x')).toBe(true)
    expect(verifyPactTerms(baseCanonicalPact, validPlaintext, expectedHash)).toBe(true)
  })

  it('fails verification if plaintext is modified by even a single character', () => {
    const alteredPlaintext = 'Deliver 50 specialized engineering assets before deadline!'
    expect(verifyPactTerms(baseCanonicalPact, alteredPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if Maker address changes', () => {
    const altered = { ...baseCanonicalPact, maker: '0x9999999999999999999999999999999999999999' as `0x${string}` }
    expect(verifyPactTerms(altered, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if Taker address changes', () => {
    const altered = { ...baseCanonicalPact, taker: '0x9999999999999999999999999999999999999999' as `0x${string}` }
    expect(verifyPactTerms(altered, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if Arbiter address changes', () => {
    const altered = { ...baseCanonicalPact, arbiter: '0x9999999999999999999999999999999999999999' as `0x${string}` }
    expect(verifyPactTerms(altered, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if collateral amounts are modified', () => {
    const alteredMakerAmount = { ...baseCanonicalPact, amountMaker: 500_000n }
    expect(verifyPactTerms(alteredMakerAmount, validPlaintext, expectedHash)).toBe(false)

    const alteredTakerAmount = { ...baseCanonicalPact, amountTaker: 999_999n }
    expect(verifyPactTerms(alteredTakerAmount, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if Arbiter Fee Cap is modified', () => {
    const alteredFeeCap = { ...baseCanonicalPact, arbiterFeeCap: 50_000n }
    expect(verifyPactTerms(alteredFeeCap, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if deadlines are shifted', () => {
    const alteredOffer = { ...baseCanonicalPact, offerExpiry: 1_900_000_000n }
    expect(verifyPactTerms(alteredOffer, validPlaintext, expectedHash)).toBe(false)

    const alteredPerf = { ...baseCanonicalPact, performanceDeadline: 1_900_000_000n }
    expect(verifyPactTerms(alteredPerf, validPlaintext, expectedHash)).toBe(false)

    const alteredDispute = { ...baseCanonicalPact, disputeDeadline: 1_900_000_000n }
    expect(verifyPactTerms(alteredDispute, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if Agreement Kind is changed (Escrow vs Bounty)', () => {
    const alteredKind = { ...baseCanonicalPact, kind: 1 }
    expect(verifyPactTerms(alteredKind, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if chainId domain changes (cross-chain replay protection)', () => {
    const ethereumMainnet = { ...baseCanonicalPact, chainId: 1n }
    expect(verifyPactTerms(ethereumMainnet, validPlaintext, expectedHash)).toBe(false)
  })

  it('fails verification if pact contract address changes', () => {
    const alteredContract = { ...baseCanonicalPact, pactAddress: '0x8888888888888888888888888888888888888888' as `0x${string}` }
    expect(verifyPactTerms(alteredContract, validPlaintext, expectedHash)).toBe(false)
  })
})
