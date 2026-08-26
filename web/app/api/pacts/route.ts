import { NextRequest } from 'next/server'
import { createPublicClient, http, isAddress } from 'viem'
import { PACT_ABI } from '../../../lib/abi'
import { PACT_V1_DEPLOYMENT_BLOCK, arcTestnet, getPactAddress } from '../../../lib/arc'

export const dynamic = 'force-dynamic'

const RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network'
const MAX_PAGE_SIZE = 50
// Arc RPC rejects broad eth_getLogs ranges; 10k blocks has been live-verified.
const BLOCK_WINDOW = 10_000n

const client = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL, { timeout: 10_000 }) })

type Cursor = { blockNumber: bigint; logIndex: number }

function parseCursor(raw: string | null, latestBlock: bigint): Cursor {
  if (!raw) return { blockNumber: latestBlock, logIndex: Number.MAX_SAFE_INTEGER }
  const [block, index] = raw.split(':')
  try {
    const blockNumber = BigInt(block)
    const logIndex = Number(index)
    if (blockNumber < PACT_V1_DEPLOYMENT_BLOCK || blockNumber > latestBlock || !Number.isSafeInteger(logIndex) || logIndex < 0) {
      throw new Error('Invalid cursor')
    }
    return { blockNumber, logIndex }
  } catch {
    throw new Error('Invalid cursor')
  }
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

async function readPact(address: `0x${string}`, id: number) {
  return client.readContract({ address, abi: PACT_ABI, functionName: 'getPact', args: [BigInt(id)] })
}

async function createdLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
  account: `0x${string}` | null,
) {
  const base = { address, abi: PACT_ABI, eventName: 'PactCreated', fromBlock, toBlock } as const
  if (!account) return client.getContractEvents(base)

  const [asMaker, asTaker] = await Promise.all([
    client.getContractEvents({ ...base, args: { maker: account } }),
    client.getContractEvents({ ...base, args: { taker: account } }),
  ])
  const unique = new Map<string, (typeof asMaker)[number]>()
  for (const log of [...asMaker, ...asTaker]) unique.set(`${log.transactionHash}:${log.logIndex}`, log)
  return [...unique.values()]
}

export async function GET(request: NextRequest) {
  const protocolAddress = getPactAddress()
  if (!protocolAddress) return Response.json({ error: 'PACT address is not configured' }, { status: 503 })

  const accountParam = request.nextUrl.searchParams.get('account')
  if (accountParam && !isAddress(accountParam)) return Response.json({ error: 'Invalid account address' }, { status: 400 })
  const account = accountParam as `0x${string}` | null
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 25)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 25))

  try {
    const latestBlock = await client.getBlockNumber()
    const cursor = parseCursor(request.nextUrl.searchParams.get('cursor'), latestBlock)
    const matches: Awaited<ReturnType<typeof createdLogs>> = []
    let toBlock = cursor.blockNumber

    while (toBlock >= PACT_V1_DEPLOYMENT_BLOCK && matches.length <= limit) {
      const fromBlock = toBlock - PACT_V1_DEPLOYMENT_BLOCK >= BLOCK_WINDOW
        ? toBlock - BLOCK_WINDOW + 1n
        : PACT_V1_DEPLOYMENT_BLOCK
      const logs = await createdLogs(protocolAddress, fromBlock, toBlock, account)
      logs
        .filter(log => log.blockNumber < cursor.blockNumber || (log.blockNumber === cursor.blockNumber && Number(log.logIndex) < cursor.logIndex))
        .sort((a, b) => a.blockNumber === b.blockNumber ? Number(b.logIndex) - Number(a.logIndex) : a.blockNumber > b.blockNumber ? -1 : 1)
        .forEach(log => matches.push(log))
      if (fromBlock === PACT_V1_DEPLOYMENT_BLOCK) break
      toBlock = fromBlock - 1n
    }

    matches.sort((a, b) => a.blockNumber === b.blockNumber ? Number(b.logIndex) - Number(a.logIndex) : a.blockNumber > b.blockNumber ? -1 : 1)
    const pageLogs = matches.slice(0, limit)
    const records = await Promise.all(pageLogs.map(async log => {
      const id = Number(log.args.id)
      return serializePact(id, await readPact(protocolAddress, id))
    }))
    const last = pageLogs.at(-1)
    const hasMore = matches.length > limit || Boolean(last && last.blockNumber > PACT_V1_DEPLOYMENT_BLOCK)

    return Response.json({
      items: records,
      nextCursor: hasMore && last ? `${last.blockNumber}:${last.logIndex}` : null,
      indexedThroughBlock: latestBlock.toString(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Indexer request failed'
    return Response.json({ error: message }, { status: message === 'Invalid cursor' ? 400 : 502 })
  }
}
