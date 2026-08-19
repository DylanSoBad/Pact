import { PactData } from './reads'
import { getPactAddress } from './arc'

export type IndexerStats = {
  totalPacts: number
  activePacts: number
  settledPacts: number
  totalVolumeUSD: string
  settledVolumeUSD: string
  activeVolumeUSD: string
}

export type GraphQLResponse = {
  pacts: PactData[]
  stats: IndexerStats
  latencyMs: number
}

/**
 * Executes a GraphQL query against the dedicated PACT Subgraph Indexer
 */
export async function queryPactsGraphQL(params: {
  status?: number
  kind?: number
  address?: string
  search?: string
  contractAddress?: `0x${string}`
}): Promise<GraphQLResponse> {
  const t0 = performance.now()
  const contractAddress = params.contractAddress || getPactAddress()

  try {
    const res = await fetch('/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-contract-address': contractAddress,
      },
      body: JSON.stringify({
        query: `
          query GetPacts($status: Int, $kind: Int, $address: String, $search: String, $contractAddress: String) {
            pacts(status: $status, kind: $kind, address: $address, search: $search, contractAddress: $contractAddress) {
              id
              maker
              amountMaker
              kind
              status
              taker
              amountTaker
              blurSize
              tokenMaker
              createdAt
              tokenTaker
              updatedAt
              termsHash
              proofHash
              deadline
            }
            stats {
              totalPacts
              activePacts
              settledPacts
              totalVolumeUSD
              settledVolumeUSD
              activeVolumeUSD
            }
          }
        `,
        variables: { ...params, contractAddress },
      }),
    })

    const json = await res.json()
    const t1 = performance.now()
    const latency = Math.round(t1 - t0)

    if (json?.data?.pacts) {
      return {
        pacts: json.data.pacts.map((p: any) => ({
          ...p,
          id: Number(p.id),
          kind: Number(p.kind),
          status: Number(p.status),
          amountMaker: BigInt(p.amountMaker),
          amountTaker: BigInt(p.amountTaker),
          createdAt: BigInt(p.createdAt),
          updatedAt: BigInt(p.updatedAt),
          deadline: BigInt(p.deadline),
        })),
        stats: json.data.stats || {
          totalPacts: 0,
          activePacts: 0,
          settledPacts: 0,
          totalVolumeUSD: '0.00',
          settledVolumeUSD: '0.00',
          activeVolumeUSD: '0.00',
        },
        latencyMs: latency,
      }
    }
  } catch (e) {
    console.warn('GraphQL Indexer query error, falling back to multicall:', e)
  }

  return {
    pacts: [],
    stats: {
      totalPacts: 0,
      activePacts: 0,
      settledPacts: 0,
      totalVolumeUSD: '0.00',
      settledVolumeUSD: '0.00',
      activeVolumeUSD: '0.00',
    },
    latencyMs: 0,
  }
}
