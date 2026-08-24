import { describe, expect, it, vi } from 'vitest'
import { hashDomain } from 'viem'
import { permitDomainTypes, signPermit } from '../lib/permit'

const token = '0x3600000000000000000000000000000000000000' as const
const owner = '0x1111111111111111111111111111111111111111' as const
const spender = '0x2222222222222222222222222222222222222222' as const
const chainId = 5_042_002
const domain = { name: 'USD Coin', version: '1', chainId: BigInt(chainId), verifyingContract: token } as const

function clients(domainSeparator = hashDomain({ domain, types: permitDomainTypes })) {
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === 'name') return 'USD Coin'
    if (functionName === 'version') return '1'
    if (functionName === 'nonces') return 7n
    if (functionName === 'DOMAIN_SEPARATOR') return domainSeparator
    throw new Error(`Unexpected read ${functionName}`)
  })
  const signTypedData = vi.fn(async () => `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as `0x${string}`)
  return {
    publicClient: { readContract } as never,
    walletClient: { signTypedData } as never,
    readContract,
    signTypedData,
  }
}

describe('EIP-2612 permit', () => {
  it('reads token metadata/nonce and returns canonical signature fields', async () => {
    const mock = clients()
    const permit = await signPermit({
      publicClient: mock.publicClient,
      walletClient: mock.walletClient,
      chainId,
      token,
      owner,
      spender,
      value: 1_000_000n,
    })

    expect(mock.readContract).toHaveBeenCalledTimes(4)
    expect(mock.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      domain,
      primaryType: 'Permit',
      message: expect.objectContaining({ owner, spender, value: 1_000_000n, nonce: 7n }),
    }))
    expect(permit).toMatchObject({ v: 27, r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}` })
  })

  it('refuses to sign on a mismatched domain separator', async () => {
    const mock = clients(`0x${'ff'.repeat(32)}`)
    await expect(signPermit({
      publicClient: mock.publicClient,
      walletClient: mock.walletClient,
      chainId,
      token,
      owner,
      spender,
      value: 1n,
    })).rejects.toThrow('domain separator')
    expect(mock.signTypedData).not.toHaveBeenCalled()
  })
})
