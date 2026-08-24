import { hashDomain, parseSignature, type PublicClient, type WalletClient } from 'viem'
import { EIP2612_ABI } from './abi'

export type PermitAuthorization = {
  deadline: bigint
  v: number
  r: `0x${string}`
  s: `0x${string}`
}

const permitTypes = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const permitDomainTypes = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
} as const

export async function signPermit(args: {
  publicClient: PublicClient
  walletClient: WalletClient
  chainId: number
  token: `0x${string}`
  owner: `0x${string}`
  spender: `0x${string}`
  value: bigint
}): Promise<PermitAuthorization> {
  const { publicClient, walletClient, chainId, token, owner, spender, value } = args
  const [name, version, nonce, onChainDomainSeparator] = await Promise.all([
    publicClient.readContract({ address: token, abi: EIP2612_ABI, functionName: 'name' }),
    publicClient.readContract({ address: token, abi: EIP2612_ABI, functionName: 'version' }),
    publicClient.readContract({ address: token, abi: EIP2612_ABI, functionName: 'nonces', args: [owner] }),
    publicClient.readContract({ address: token, abi: EIP2612_ABI, functionName: 'DOMAIN_SEPARATOR' }),
  ])
  const domain = { name, version, chainId: BigInt(chainId), verifyingContract: token } as const
  const expectedDomainSeparator = hashDomain({ domain, types: permitDomainTypes })
  if (expectedDomainSeparator.toLowerCase() !== onChainDomainSeparator.toLowerCase()) {
    throw new Error('Token EIP-2612 domain separator does not match the connected chain')
  }
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
  const signature = await walletClient.signTypedData({
    account: owner,
    domain,
    types: permitTypes,
    primaryType: 'Permit',
    message: { owner, spender, value, nonce, deadline },
  })
  const parsed = parseSignature(signature)
  const v = Number(parsed.v ?? (parsed.yParity === 0 ? 27 : 28))
  if (v !== 27 && v !== 28) throw new Error('Wallet returned an invalid EIP-2612 recovery value')
  return { deadline, v, r: parsed.r, s: parsed.s }
}

export { permitDomainTypes, permitTypes }
