import { keccak256, toHex } from 'viem'

export function hashTerms(terms: string): `0x${string}` {
  const encoded = new TextEncoder().encode(terms)
  return keccak256(toHex(encoded))
}

export function verifyTerms(terms: string, onChainHash: `0x${string}`): boolean {
  return hashTerms(terms) === onChainHash
}
