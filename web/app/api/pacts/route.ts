import { NextRequest } from 'next/server'
import { createPublicClient, http, isAddress } from 'viem'
import { PACT_ABI } from '../../../lib/abi'
import { arcTestnet, getPactAddress } from '../../../lib/arc'

export const dynamic = 'force-dynamic'

const RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network'
const MAX_PAGE_SIZE = 50
const MAX_SCANNED_IDS = 100
const READ_CONCURRENCY = 8

const client = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL, { timeout: 10_000 }) })

function parseCursor(raw: string | null, maxId: number): number {
  if (!raw) return maxId
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > maxId) throw new Error('Invalid cursor')
  return value
}

async function readPact(address: `0x${string}`, id: number) {
  return client.readContract({ address, abi: PACT_ABI, functionName: 'getPact', args: [BigInt(id)] })
}

function serializePact(id: number, pact: Awaited<ReturnType<typeof readPact>>) {
  return {
    id,
    ...pact,
    amountMaker: pact.amountMaker.toString(),
    amountTaker: pact.amountTaker.toString(),
    collateralMaker: pact.collateralMaker.toString(),
    collateralTaker: pact.collateralTaker.toString(),
    notionalUSDC: pact.notionalUSDC.toString(),
    bondAmount: pact.bondAmount.toString(),
    arbiterFeeCap: pact.arbiterFeeCap.toString(),
    offerExpiry: pact.offerExpiry.toString(),
    performanceDeadline: pact.performanceDeadline.toString(),
    disputeDeadline: pact.disputeDeadline.toString(),
    createdAt: pact.createdAt.toString(),
    updatedAt: pact.updatedAt.toString(),
    kind: Number(pact.kind),
    status: Number(pact.status),
    deadline: pact.disputeDeadline.toString(),
  }
}

/**
 * Arc throttles broad log searches. The protocol exposes a monotonic `nextId`,
 * so this bounded on-chain catalogue is more reliable than `eth_getLogs` while
 * still allowing complete, cursor-based history traversal for every wallet.
 */
export async function GET(request: NextRequest) {
  const protocolAddress = getPactAddress()
  if (!protocolAddress) return Response.json({ error: 'PACT address is not configured' }, { status: 503 })

  const accountParam = request.nextUrl.searchParams.get('account')
  if (accountParam && !isAddress(accountParam)) return Response.json({ error: 'Invalid account address' }, { status: 400 })
  const account = accountParam?.toLowerCase() ?? null
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 25)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 25))

  try {
    const nextId = Number(await client.readContract({ address: protocolAddress, abi: PACT_ABI, functionName: 'nextId' }))
    const maxId = nextId - 1
    if (maxId < 1) return Response.json({ items: [], nextCursor: null, indexedThroughId: 0 }, { headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' } })

    let currentId = parseCursor(request.nextUrl.searchParams.get('cursor'), maxId)
    let scanned = 0
    const records: ReturnType<typeof serializePact>[] = []

    while (currentId >= 1 && scanned < MAX_SCANNED_IDS && records.length < limit) {
      const ids = Array.from({ length: Math.min(READ_CONCURRENCY, currentId, MAX_SCANNED_IDS - scanned) }, (_, index) => currentId - index)
      const pacts = await Promise.all(ids.map(async id => ({ id, pact: await readPact(protocolAddress, id) })))
      let processed = 0
      for (const item of pacts) {
        processed += 1
        const isParticipant = !account || item.pact.maker.toLowerCase() === account || item.pact.taker.toLowerCase() === account || item.pact.arbiter.toLowerCase() === account
        if (isParticipant) records.push(serializePact(item.id, item.pact))
        if (records.length === limit) break
      }
      scanned += processed
      currentId -= processed
    }

    return Response.json({
      items: records,
      nextCursor: currentId >= 1 ? String(currentId) : null,
      indexedThroughId: maxId,
    }, { headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Indexer request failed'
    return Response.json({ error: message }, { status: message === 'Invalid cursor' ? 400 : 502 })
  }
}
