import { createPublicClient, http } from 'viem'
import { arcTestnet } from './arc'
import { PACT_ABI } from './abi'

const PACT_ADDRESS = process.env.NEXT_PUBLIC_PACT_ADDRESS as `0x${string}`

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(),
})

export type PactData = {
  id: number
  maker: string
  amountMaker: bigint
  kind: number
  status: number
  taker: string
  amountTaker: bigint
  blurSize: boolean
  tokenMaker: string
  createdAt: bigint
  tokenTaker: string
  updatedAt: bigint
  termsHash: string
  proofHash: string
  deadline: bigint
}

export async function fetchNextId(): Promise<number> {
  try {
    const result = await client.readContract({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'nextId',
    })
    return Number(result)
  } catch {
    return 1
  }
}

export async function fetchPacts(maxCount = 50): Promise<PactData[]> {
  const nextId = await fetchNextId()
  if (nextId <= 1) return []

  const totalPacts = nextId - 1
  const count = Math.min(totalPacts, maxCount)
  const startId = nextId - count

  // Build multicall for getPact + deadlines
  const calls: { address: `0x${string}`; abi: typeof PACT_ABI; functionName: string; args: readonly [bigint] }[] = []

  for (let i = startId; i < nextId; i++) {
    calls.push({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'getPact',
      args: [BigInt(i)] as const,
    })
    calls.push({
      address: PACT_ADDRESS,
      abi: PACT_ABI,
      functionName: 'deadlines',
      args: [BigInt(i)] as const,
    })
  }

  try {
    const results = await client.multicall({ contracts: calls as any })

    const pacts: PactData[] = []

    for (let i = 0; i < count; i++) {
      const pactResult = results[i * 2]
      const deadlineResult = results[i * 2 + 1]

      if (pactResult.status !== 'success' || deadlineResult.status !== 'success') continue

      const p = pactResult.result as any
      const deadline = deadlineResult.result as bigint

      pacts.push({
        id: startId + i,
        maker: p.maker,
        amountMaker: p.amountMaker,
        kind: Number(p.kind),
        status: Number(p.status),
        taker: p.taker,
        amountTaker: p.amountTaker,
        blurSize: p.blurSize,
        tokenMaker: p.tokenMaker,
        createdAt: p.createdAt,
        tokenTaker: p.tokenTaker,
        updatedAt: p.updatedAt,
        termsHash: p.termsHash,
        proofHash: p.proofHash,
        deadline,
      })
    }

    // Sort descending by updatedAt
    pacts.sort((a, b) => Number(b.updatedAt - a.updatedAt))
    return pacts
  } catch {
    return []
  }
}

export async function fetchSinglePact(id: number): Promise<PactData | null> {
  try {
    const [pactResult, deadlineResult] = await client.multicall({
      contracts: [
        {
          address: PACT_ADDRESS,
          abi: PACT_ABI,
          functionName: 'getPact',
          args: [BigInt(id)],
        },
        {
          address: PACT_ADDRESS,
          abi: PACT_ABI,
          functionName: 'deadlines',
          args: [BigInt(id)],
        },
      ] as any,
    })

    if (pactResult.status !== 'success' || deadlineResult.status !== 'success') return null

    const p = pactResult.result as any
    const deadline = deadlineResult.result as bigint

    // Check if pact exists (maker is zero address means it doesn't)
    if (p.maker === '0x0000000000000000000000000000000000000000') return null

    return {
      id,
      maker: p.maker,
      amountMaker: p.amountMaker,
      kind: Number(p.kind),
      status: Number(p.status),
      taker: p.taker,
      amountTaker: p.amountTaker,
      blurSize: p.blurSize,
      tokenMaker: p.tokenMaker,
      createdAt: p.createdAt,
      tokenTaker: p.tokenTaker,
      updatedAt: p.updatedAt,
      termsHash: p.termsHash,
      proofHash: p.proofHash,
      deadline,
    }
  } catch {
    return null
  }
}

export async function fetchReputation(address: `0x${string}`): Promise<{
  cleared: number
  slashed: number
  notional: bigint
}> {
  try {
    const results = await client.multicall({
      contracts: [
        { address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'clearedCount', args: [address] },
        { address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'slashedCount', args: [address] },
        { address: PACT_ADDRESS, abi: PACT_ABI, functionName: 'clearedNotional', args: [address] },
      ] as any,
    })

    return {
      cleared: results[0].status === 'success' ? Number(results[0].result) : 0,
      slashed: results[1].status === 'success' ? Number(results[1].result) : 0,
      notional: results[2].status === 'success' ? (results[2].result as bigint) : 0n,
    }
  } catch {
    return { cleared: 0, slashed: 0, notional: 0n }
  }
}
