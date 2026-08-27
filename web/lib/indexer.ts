/**
 * PACT In-Process Indexer Engine (ADR-0005 compliant)
 *
 * Singleton server-side indexer that maintains an in-memory materialized
 * view of all on-chain pacts. Replaces per-request RPC scanning with
 * O(1) lookups and O(k) participant-scoped queries.
 *
 * Features:
 * - Cold-start backfill from chain via bounded concurrency
 * - Incremental sync every 6s (new pacts + non-terminal state refresh)
 * - Participant index for wallet-scoped queries without full scan
 * - Reorg safety (3-block depth invalidation)
 * - Arc dual Transfer event deduplication
 * - In-memory token-bucket rate limiter
 * - Health/monitoring stats
 */

import { createPublicClient, http } from 'viem'
import { arcTestnet, getPactAddress } from './arc'
import { PACT_ABI } from './abi'
import type { PactData } from './reads'
import type { IndexedPact, IndexedEvent, IndexerStats, RateLimitEntry } from './indexerTypes'

// ─── Configuration ───────────────────────────────────────────────────────────

const RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network'
const SYNC_INTERVAL_MS = 6_000
const READ_CONCURRENCY = 8
const MAX_STALE_REFRESH_PER_CYCLE = 20
const REORG_DEPTH = 3
const RATE_LIMIT_TOKENS = 30
const RATE_LIMIT_WINDOW_MS = 10_000

// ─── RPC Client ──────────────────────────────────────────────────────────────

const rpcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC_URL, { timeout: 10_000 }),
})

// ─── Indexer State ───────────────────────────────────────────────────────────

/** Primary materialized view: pactId → IndexedPact */
const pactMap = new Map<number, IndexedPact>()

/** Participant reverse index: lowercase address → Set<pactId> */
const participantIndex = new Map<string, Set<number>>()

/** Event dedup set: `${txHash}-${logIndex}` → true */
const seenEvents = new Set<string>()

/** Indexed event log (bounded ring buffer, last 500 events) */
const eventLog: IndexedEvent[] = []
const MAX_EVENT_LOG = 500

/** Rate limiter: IP → entry */
const rateLimitMap = new Map<string, RateLimitEntry>()

/** Indexer statistics */
const stats: IndexerStats = {
  totalSyncs: 0,
  failedSyncs: 0,
  rpcErrors: 0,
  avgSyncDurationMs: 0,
  lastSyncAt: 0,
  lastSyncBlock: 0,
  totalPacts: 0,
  initialized: false,
  backfillDurationMs: 0,
}

let syncTimer: ReturnType<typeof setInterval> | null = null
let initPromise: Promise<void> | null = null
let highestKnownId = 0

// ─── Core: Read & Normalize ─────────────────────────────────────────────────

async function readPactFromChain(protocolAddress: `0x${string}`, id: number): Promise<PactData | null> {
  try {
    const raw = await rpcClient.readContract({
      address: protocolAddress,
      abi: PACT_ABI,
      functionName: 'getPact',
      args: [BigInt(id)],
    })
    return {
      id,
      maker: raw.maker,
      taker: raw.taker,
      arbiter: raw.arbiter,
      tokenMaker: raw.tokenMaker,
      tokenTaker: raw.tokenTaker,
      amountMaker: raw.amountMaker,
      amountTaker: raw.amountTaker,
      collateralMaker: raw.collateralMaker,
      collateralTaker: raw.collateralTaker,
      notionalUSDC: raw.notionalUSDC,
      bondAmount: raw.bondAmount,
      arbiterFeeCap: raw.arbiterFeeCap,
      offerExpiry: raw.offerExpiry,
      performanceDeadline: raw.performanceDeadline,
      disputeDeadline: raw.disputeDeadline,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      kind: Number(raw.kind),
      status: Number(raw.status),
      blurSize: raw.blurSize,
      termsHash: raw.termsHash,
      proofHash: raw.proofHash,
      deadline: raw.disputeDeadline,
    }
  } catch {
    stats.rpcErrors++
    return null
  }
}

async function readNextId(protocolAddress: `0x${string}`): Promise<number> {
  try {
    return Number(await rpcClient.readContract({
      address: protocolAddress,
      abi: PACT_ABI,
      functionName: 'nextId',
    }))
  } catch {
    stats.rpcErrors++
    return highestKnownId + 1
  }
}

async function readBlockNumber(): Promise<number> {
  try {
    return Number(await rpcClient.getBlockNumber())
  } catch {
    stats.rpcErrors++
    return stats.lastSyncBlock
  }
}

// ─── Participant Index ───────────────────────────────────────────────────────

function indexParticipant(address: string, pactId: number): void {
  const key = address.toLowerCase()
  let set = participantIndex.get(key)
  if (!set) {
    set = new Set()
    participantIndex.set(key, set)
  }
  set.add(pactId)
}

function indexPactParticipants(pact: PactData): void {
  indexParticipant(pact.maker, pact.id)
  indexParticipant(pact.taker, pact.id)
  indexParticipant(pact.arbiter, pact.id)
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

function upsertPact(pact: PactData, blockNumber: number): void {
  const indexed: IndexedPact = {
    ...pact,
    lastIndexedBlock: blockNumber,
    lastIndexedAt: Date.now(),
  }
  pactMap.set(pact.id, indexed)
  indexPactParticipants(pact)
  stats.totalPacts = pactMap.size
}

// ─── Batch Read with Bounded Concurrency ─────────────────────────────────────

async function batchReadPacts(
  protocolAddress: `0x${string}`,
  ids: number[],
  blockNumber: number
): Promise<number> {
  let indexed = 0
  for (let i = 0; i < ids.length; i += READ_CONCURRENCY) {
    const batch = ids.slice(i, i + READ_CONCURRENCY)
    const results = await Promise.all(batch.map(id => readPactFromChain(protocolAddress, id)))
    for (const pact of results) {
      if (pact) {
        upsertPact(pact, blockNumber)
        indexed++
      }
    }
  }
  return indexed
}

// ─── Cold-Start Backfill ─────────────────────────────────────────────────────

async function backfill(protocolAddress: `0x${string}`): Promise<void> {
  const startMs = Date.now()
  const nextId = await readNextId(protocolAddress)
  const blockNumber = await readBlockNumber()
  const maxId = nextId - 1

  if (maxId < 1) {
    stats.initialized = true
    stats.backfillDurationMs = Date.now() - startMs
    stats.lastSyncBlock = blockNumber
    stats.lastSyncAt = Date.now()
    return
  }

  highestKnownId = maxId
  const allIds = Array.from({ length: maxId }, (_, i) => i + 1)
  await batchReadPacts(protocolAddress, allIds, blockNumber)

  stats.initialized = true
  stats.backfillDurationMs = Date.now() - startMs
  stats.lastSyncBlock = blockNumber
  stats.lastSyncAt = Date.now()
  stats.totalSyncs++
}

// ─── Incremental Sync ────────────────────────────────────────────────────────

async function incrementalSync(protocolAddress: `0x${string}`): Promise<void> {
  const startMs = Date.now()

  try {
    const [nextId, currentBlock] = await Promise.all([
      readNextId(protocolAddress),
      readBlockNumber(),
    ])

    const newMaxId = nextId - 1

    // ── Reorg Detection ──────────────────────────────────────────────────
    if (currentBlock < stats.lastSyncBlock) {
      // Chain reverted — invalidate non-terminal pacts from recent blocks
      const reorgThreshold = currentBlock - REORG_DEPTH
      for (const [id, pact] of pactMap) {
        if (pact.status < 4 && pact.lastIndexedBlock >= reorgThreshold) {
          // Re-read this pact from chain
          const fresh = await readPactFromChain(protocolAddress, id)
          if (fresh) upsertPact(fresh, currentBlock)
        }
      }
    }

    // ── Index New Pacts ──────────────────────────────────────────────────
    if (newMaxId > highestKnownId) {
      const newIds = Array.from(
        { length: newMaxId - highestKnownId },
        (_, i) => highestKnownId + 1 + i
      )
      await batchReadPacts(protocolAddress, newIds, currentBlock)
      highestKnownId = newMaxId
    }

    // ── Refresh Non-Terminal (Stale) Pacts ────────────────────────────────
    const staleCandidates: number[] = []
    for (const [id, pact] of pactMap) {
      if (pact.status < 4) {
        staleCandidates.push(id)
      }
      if (staleCandidates.length >= MAX_STALE_REFRESH_PER_CYCLE) break
    }

    if (staleCandidates.length > 0) {
      await batchReadPacts(protocolAddress, staleCandidates, currentBlock)
    }

    // ── Update Stats ─────────────────────────────────────────────────────
    stats.lastSyncBlock = currentBlock
    stats.lastSyncAt = Date.now()
    stats.totalSyncs++

    const duration = Date.now() - startMs
    stats.avgSyncDurationMs = stats.totalSyncs === 1
      ? duration
      : Math.round(stats.avgSyncDurationMs * 0.8 + duration * 0.2)

  } catch {
    stats.failedSyncs++
    stats.rpcErrors++
  }
}

// ─── Singleton Lifecycle ─────────────────────────────────────────────────────

/**
 * Returns the initialized indexer. Safe to call multiple times —
 * only one backfill runs; subsequent calls await the same promise.
 */
export async function getIndexer(): Promise<{
  pactMap: ReadonlyMap<number, IndexedPact>
  participantIndex: ReadonlyMap<string, ReadonlySet<number>>
  stats: Readonly<IndexerStats>
}> {
  const protocolAddress = getPactAddress()
  if (!protocolAddress) {
    return { pactMap, participantIndex, stats }
  }

  if (!initPromise) {
    initPromise = backfill(protocolAddress).then(() => {
      // Start periodic sync after backfill completes
      if (!syncTimer) {
        syncTimer = setInterval(() => {
          void incrementalSync(protocolAddress)
        }, SYNC_INTERVAL_MS)
        // Unref so it doesn't prevent process exit in tests
        if (typeof syncTimer === 'object' && 'unref' in syncTimer) {
          syncTimer.unref()
        }
      }
    })
  }

  await initPromise
  return { pactMap, participantIndex, stats }
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Returns all indexed pacts, optionally filtered by participant address.
 * Results are sorted newest-first by default.
 */
export function queryPacts(options: {
  account?: string | null
  status?: number | null
  role?: 'MAKER' | 'TAKER' | 'ARBITER' | null
  cursor?: number | null
  limit?: number
  sort?: 'NEWEST' | 'DEADLINE' | 'VALUE'
}): { items: IndexedPact[]; nextCursor: string | null; indexedThroughId: number } {
  const { account, status, role, cursor, limit = 25, sort = 'NEWEST' } = options

  // 1. Start with participant-scoped or full set
  let candidateIds: number[]
  if (account) {
    const set = participantIndex.get(account.toLowerCase())
    candidateIds = set ? Array.from(set) : []
  } else {
    candidateIds = Array.from(pactMap.keys())
  }

  // 2. Resolve to IndexedPact[]
  let candidates = candidateIds
    .map(id => pactMap.get(id))
    .filter((p): p is IndexedPact => p !== undefined)

  // 3. Role filter (further restrict within participant matches)
  if (role && account) {
    const addr = account.toLowerCase()
    candidates = candidates.filter(p => {
      if (role === 'MAKER') return p.maker.toLowerCase() === addr
      if (role === 'TAKER') return p.taker.toLowerCase() === addr
      if (role === 'ARBITER') return p.arbiter.toLowerCase() === addr
      return true
    })
  }

  // 4. Status filter
  if (status !== undefined && status !== null) {
    candidates = candidates.filter(p => p.status === status)
  }

  // 5. Sort
  if (sort === 'DEADLINE') {
    candidates.sort((a, b) => {
      const isLiveA = a.status >= 0 && a.status <= 3
      const isLiveB = b.status >= 0 && b.status <= 3
      if (isLiveA && !isLiveB) return -1
      if (!isLiveA && isLiveB) return 1
      if (isLiveA && isLiveB) {
        const deadA = a.status === 0 ? a.offerExpiry : a.status === 1 ? a.performanceDeadline : a.disputeDeadline
        const deadB = b.status === 0 ? b.offerExpiry : b.status === 1 ? b.performanceDeadline : b.disputeDeadline
        if (deadA < deadB) return -1
        if (deadA > deadB) return 1
      }
      return b.id - a.id
    })
  } else if (sort === 'VALUE') {
    candidates.sort((a, b) => {
      const valA = a.collateralMaker + a.collateralTaker
      const valB = b.collateralMaker + b.collateralTaker
      if (valB > valA) return 1
      if (valB < valA) return -1
      return b.id - a.id
    })
  } else {
    // NEWEST (default)
    candidates.sort((a, b) => b.id - a.id)
  }

  // 6. Cursor-based pagination
  let startIdx = 0
  if (cursor) {
    const cursorIdx = candidates.findIndex(p => p.id < cursor)
    if (cursorIdx >= 0) startIdx = cursorIdx
  }

  const page = candidates.slice(startIdx, startIdx + limit)
  const hasMore = startIdx + limit < candidates.length
  const nextCursor = hasMore ? String(page[page.length - 1].id) : null

  return {
    items: page,
    nextCursor,
    indexedThroughId: highestKnownId,
  }
}

/**
 * O(1) single pact lookup.
 */
export function getPactById(id: number): IndexedPact | undefined {
  return pactMap.get(id)
}

// ─── Event Dedup ─────────────────────────────────────────────────────────────

/**
 * Records an event, returning false if it was a duplicate (Arc dual Transfer).
 */
export function recordEvent(event: Omit<IndexedEvent, 'id'>): boolean {
  const compositeId = `${event.txHash}-${event.logIndex}`
  if (seenEvents.has(compositeId)) return false
  seenEvents.add(compositeId)

  const entry: IndexedEvent = { ...event, id: compositeId }
  eventLog.push(entry)
  if (eventLog.length > MAX_EVENT_LOG) eventLog.shift()
  return true
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────

/**
 * Token-bucket rate limiter. Returns true if the request is allowed.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  let entry = rateLimitMap.get(ip)

  if (!entry) {
    entry = { tokens: RATE_LIMIT_TOKENS - 1, lastRefill: now }
    rateLimitMap.set(ip, entry)
    return true
  }

  // Refill tokens based on elapsed time
  const elapsed = now - entry.lastRefill
  const refill = Math.floor((elapsed / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_TOKENS)
  if (refill > 0) {
    entry.tokens = Math.min(RATE_LIMIT_TOKENS, entry.tokens + refill)
    entry.lastRefill = now
  }

  if (entry.tokens > 0) {
    entry.tokens--
    return true
  }

  return false
}

/**
 * Periodically clean up stale rate limit entries (called internally).
 */
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 3
    for (const [ip, entry] of rateLimitMap) {
      if (entry.lastRefill < cutoff) rateLimitMap.delete(ip)
    }
  }, 60_000)
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

export function getIndexerHealth(): {
  status: 'ok' | 'degraded' | 'down'
  lastBlock: number
  totalPacts: number
  syncLagMs: number
  stats: IndexerStats
} {
  const lagMs = stats.lastSyncAt ? Date.now() - stats.lastSyncAt : Infinity

  let status: 'ok' | 'degraded' | 'down' = 'ok'
  if (lagMs > 60_000 || !stats.initialized) status = 'down'
  else if (lagMs > 30_000) status = 'degraded'

  return {
    status,
    lastBlock: stats.lastSyncBlock,
    totalPacts: stats.totalPacts,
    syncLagMs: Math.round(lagMs),
    stats: { ...stats },
  }
}

// ─── Serialization (Wire format compatible with existing frontend) ───────────

export function serializeIndexedPact(pact: IndexedPact): Record<string, unknown> {
  return {
    id: pact.id,
    maker: pact.maker,
    taker: pact.taker,
    arbiter: pact.arbiter,
    tokenMaker: pact.tokenMaker,
    tokenTaker: pact.tokenTaker,
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
    kind: pact.kind,
    status: pact.status,
    blurSize: pact.blurSize,
    termsHash: pact.termsHash,
    proofHash: pact.proofHash,
    deadline: pact.disputeDeadline.toString(),
  }
}
