import { createPublicClient, fallback, http } from 'viem'
import { arcTestnet, getPactAddress } from './arc'
import { PACT_ABI } from './abi'

const rpcTransports = [
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  process.env.NEXT_PUBLIC_ARC_RPC_FALLBACK_URL,
  'https://rpc.testnet.arc.network',
].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index)

export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback(rpcTransports.map(url => http(url, { timeout: 8_000 })), { rank: true }),
})

export type PactData = {
  id: number
  maker: string
  taker: string
  arbiter: string
  tokenMaker: string
  tokenTaker: string
  amountMaker: bigint
  amountTaker: bigint
  collateralMaker: bigint
  collateralTaker: bigint
  notionalUSDC: bigint
  bondAmount: bigint
  arbiterFeeCap: bigint
  offerExpiry: bigint
  performanceDeadline: bigint
  disputeDeadline: bigint
  createdAt: bigint
  updatedAt: bigint
  kind: number
  status: number
  blurSize: boolean
  termsHash: string
  proofHash: string
  /** Compatibility alias used by countdown components. */
  deadline: bigint
}

export type PactPage = {
  items: PactData[]
  nextCursor: string | null
  indexedThroughBlock: bigint
}

type WirePact = Omit<PactData,
  'amountMaker' | 'amountTaker' | 'collateralMaker' | 'collateralTaker' | 'notionalUSDC' |
  'bondAmount' | 'arbiterFeeCap' | 'offerExpiry' | 'performanceDeadline' | 'disputeDeadline' |
  'createdAt' | 'updatedAt' | 'deadline'
> & Record<
  'amountMaker' | 'amountTaker' | 'collateralMaker' | 'collateralTaker' | 'notionalUSDC' |
  'bondAmount' | 'arbiterFeeCap' | 'offerExpiry' | 'performanceDeadline' | 'disputeDeadline' |
  'createdAt' | 'updatedAt' | 'deadline', string
>

function hydratePact(value: WirePact): PactData {
  return {
    ...value,
    amountMaker: BigInt(value.amountMaker), amountTaker: BigInt(value.amountTaker),
    collateralMaker: BigInt(value.collateralMaker), collateralTaker: BigInt(value.collateralTaker),
    notionalUSDC: BigInt(value.notionalUSDC), bondAmount: BigInt(value.bondAmount),
    arbiterFeeCap: BigInt(value.arbiterFeeCap), offerExpiry: BigInt(value.offerExpiry),
    performanceDeadline: BigInt(value.performanceDeadline), disputeDeadline: BigInt(value.disputeDeadline),
    createdAt: BigInt(value.createdAt), updatedAt: BigInt(value.updatedAt), deadline: BigInt(value.deadline),
  }
}

export async function fetchPactPage(options: { account?: string; cursor?: string | null; limit?: number } = {}): Promise<PactPage> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 25) })
  if (options.account) params.set('account', options.account)
  if (options.cursor) params.set('cursor', options.cursor)
  const response = await fetch(`/api/pacts?${params}`, { cache: 'no-store' })
  const body = await response.json() as { items?: WirePact[]; nextCursor?: string | null; indexedThroughBlock?: string; error?: string }
  if (!response.ok || !body.items || body.indexedThroughBlock === undefined) throw new Error(body.error || 'PACT indexer unavailable')
  return {
    items: body.items.map(hydratePact),
    nextCursor: body.nextCursor ?? null,
    indexedThroughBlock: BigInt(body.indexedThroughBlock),
  }
}

const terminalPactCache = new Map<number, PactData>()

function requireProtocolAddress(): `0x${string}` | null {
  return getPactAddress(arcTestnet.id)
}

function normalizePact(id: number, value: Awaited<ReturnType<typeof readPactTuple>>): PactData {
  return {
    id,
    maker: value.maker,
    taker: value.taker,
    arbiter: value.arbiter,
    tokenMaker: value.tokenMaker,
    tokenTaker: value.tokenTaker,
    amountMaker: value.amountMaker,
    amountTaker: value.amountTaker,
    collateralMaker: value.collateralMaker,
    collateralTaker: value.collateralTaker,
    notionalUSDC: value.notionalUSDC,
    bondAmount: value.bondAmount,
    arbiterFeeCap: value.arbiterFeeCap,
    offerExpiry: value.offerExpiry,
    performanceDeadline: value.performanceDeadline,
    disputeDeadline: value.disputeDeadline,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    kind: Number(value.kind),
    status: Number(value.status),
    blurSize: value.blurSize,
    termsHash: value.termsHash,
    proofHash: value.proofHash,
    deadline: value.disputeDeadline,
  }
}

async function readPactTuple(address: `0x${string}`, id: number) {
  return arcPublicClient.readContract({ address, abi: PACT_ABI, functionName: 'getPact', args: [BigInt(id)] })
}

export async function fetchNextId(): Promise<number> {
  const address = requireProtocolAddress()
  if (!address) return 1
  return Number(await arcPublicClient.readContract({ address, abi: PACT_ABI, functionName: 'nextId' }))
}

/**
 * V1 deliberately avoids Arc helper contracts and Multicall3 dependencies.
 * Reads are independent RPC calls with a bounded concurrency of 50 records.
 */
export async function fetchPacts(maxCount = 50): Promise<PactData[]> {
  const address = requireProtocolAddress()
  if (!address) return []
  const nextId = await fetchNextId()
  const startId = Math.max(1, nextId - Math.min(nextId - 1, maxCount))
  const ids = Array.from({ length: nextId - startId }, (_, index) => startId + index)
  const records = await Promise.all(ids.map(async id => {
    const cached = terminalPactCache.get(id)
    if (cached) return cached
    try {
      const item = normalizePact(id, await readPactTuple(address, id))
      if (item.status >= 4) terminalPactCache.set(id, item)
      return item
    } catch {
      return null
    }
  }))
  return records.filter((item): item is PactData => item !== null).sort((a, b) => b.id - a.id)
}

export async function fetchSinglePact(id: number): Promise<PactData | null> {
  const cached = terminalPactCache.get(id)
  if (cached) return cached
  const address = requireProtocolAddress()
  if (!address) return null
  try {
    const item = normalizePact(id, await readPactTuple(address, id))
    if (item.status >= 4) terminalPactCache.set(id, item)
    return item
  } catch {
    return null
  }
}

export async function fetchReputation(address: `0x${string}`): Promise<{ cleared: number; slashed: number; notional: bigint }> {
  const protocol = requireProtocolAddress()
  if (!protocol) return { cleared: 0, slashed: 0, notional: 0n }
  try {
    const [settled, lost, notional] = await Promise.all([
      arcPublicClient.readContract({ address: protocol, abi: PACT_ABI, functionName: 'settledCount', args: [address] }),
      arcPublicClient.readContract({ address: protocol, abi: PACT_ABI, functionName: 'lostDisputeCount', args: [address] }),
      arcPublicClient.readContract({ address: protocol, abi: PACT_ABI, functionName: 'settledNotionalUSDC', args: [address] }),
    ])
    return { cleared: Number(settled), slashed: Number(lost), notional }
  } catch {
    return { cleared: 0, slashed: 0, notional: 0n }
  }
}
