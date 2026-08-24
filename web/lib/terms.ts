import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem'

export function hashTerms(terms: string): `0x${string}` {
  const encoded = new TextEncoder().encode(terms)
  return keccak256(toHex(encoded))
}

export type CanonicalPactTerms = {
  pactAddress: `0x${string}`
  chainId: bigint
  maker: `0x${string}`
  taker: `0x${string}`
  arbiter: `0x${string}`
  tokenMaker: `0x${string}`
  tokenTaker: `0x${string}`
  amountMaker: bigint
  amountTaker: bigint
  notionalUSDC: bigint
  arbiterFeeCap: bigint
  offerExpiry: bigint
  performanceDeadline: bigint
  disputeDeadline: bigint
  kind: number
  blurSize: boolean
}

const pactTermsParameters = parseAbiParameters(
  'uint256 chainId, address pactAddress, address maker, address taker, address arbiter, address tokenMaker, address tokenTaker, uint128 amountMaker, uint128 amountTaker, uint128 notionalUSDC, uint128 arbiterFeeCap, uint64 offerExpiry, uint64 performanceDeadline, uint64 disputeDeadline, uint8 kind, bool blurSize, bytes32 termsDocumentHash',
)

/** Mirrors PactContract's abi.encode canonical commitment exactly. */
export function hashPactTerms(pact: CanonicalPactTerms, plaintext: string): `0x${string}` {
  return keccak256(encodeAbiParameters(pactTermsParameters, [
    pact.chainId,
    pact.pactAddress,
    pact.maker,
    pact.taker,
    pact.arbiter,
    pact.tokenMaker,
    pact.tokenTaker,
    pact.amountMaker,
    pact.amountTaker,
    pact.notionalUSDC,
    pact.arbiterFeeCap,
    pact.offerExpiry,
    pact.performanceDeadline,
    pact.disputeDeadline,
    pact.kind,
    pact.blurSize,
    hashTerms(plaintext),
  ]))
}

export function verifyPactTerms(pact: CanonicalPactTerms, plaintext: string, onChainHash: `0x${string}`): boolean {
  return hashPactTerms(pact, plaintext) === onChainHash
}
