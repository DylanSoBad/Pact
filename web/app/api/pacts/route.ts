import { NextRequest } from 'next/server'
import { isAddress } from 'viem'
import { getIndexer, queryPacts, serializeIndexedPact, checkRateLimit } from '../../../lib/indexer'

export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 50

/**
 * Production-ready /api/pacts endpoint.
 *
 * Reads from an in-memory materialized view populated by the singleton
 * indexer engine. Supports server-side filtering, sorting, and pagination.
 *
 * Query params:
 *   account  — Filter by participant wallet address
 *   cursor   — Pagination cursor (pact ID)
 *   limit    — Page size (1–50, default 25)
 *   status   — Filter by numeric status (0=Offered, 1=Active, ...)
 *   role     — Filter by participant role (MAKER, TAKER, ARBITER)
 *   sort     — Sort order (NEWEST, DEADLINE, VALUE)
 *
 * Response shape (unchanged from V1):
 *   { items: [...], nextCursor: string | null, indexedThroughId: number }
 */
export async function GET(request: NextRequest) {
  // ── Rate Limit ─────────────────────────────────────────────────────────
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'

  if (!checkRateLimit(clientIp)) {
    return Response.json(
      { error: 'Rate limit exceeded. Maximum 30 requests per 10 seconds.' },
      { status: 429, headers: { 'Retry-After': '10' } }
    )
  }

  // ── Initialize Indexer ─────────────────────────────────────────────────
  const { stats } = await getIndexer()

  // ── Parse Query Params ─────────────────────────────────────────────────
  const accountParam = request.nextUrl.searchParams.get('account')
  if (accountParam && !isAddress(accountParam)) {
    return Response.json({ error: 'Invalid account address' }, { status: 400 })
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 25)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 25))

  const cursorParam = request.nextUrl.searchParams.get('cursor')
  const cursor = cursorParam ? Number(cursorParam) : null
  if (cursorParam && (!Number.isFinite(cursor!) || cursor! < 1)) {
    return Response.json({ error: 'Invalid cursor' }, { status: 400 })
  }

  const statusParam = request.nextUrl.searchParams.get('status')
  const statusFilter = statusParam !== null ? Number(statusParam) : null
  if (statusParam !== null && (!Number.isFinite(statusFilter!) || statusFilter! < 0 || statusFilter! > 6)) {
    return Response.json({ error: 'Invalid status filter (0-6)' }, { status: 400 })
  }

  const roleParam = request.nextUrl.searchParams.get('role')?.toUpperCase() as 'MAKER' | 'TAKER' | 'ARBITER' | undefined
  if (roleParam && !['MAKER', 'TAKER', 'ARBITER'].includes(roleParam)) {
    return Response.json({ error: 'Invalid role filter (MAKER, TAKER, ARBITER)' }, { status: 400 })
  }

  const sortParam = request.nextUrl.searchParams.get('sort')?.toUpperCase() as 'NEWEST' | 'DEADLINE' | 'VALUE' | undefined
  const sort = sortParam && ['NEWEST', 'DEADLINE', 'VALUE'].includes(sortParam) ? sortParam : 'NEWEST'

  // ── Query Materialized View ────────────────────────────────────────────
  try {
    const result = queryPacts({
      account: accountParam || null,
      status: statusFilter,
      role: roleParam || null,
      cursor,
      limit,
      sort,
    })

    const lagMs = stats.lastSyncAt ? Date.now() - stats.lastSyncAt : -1

    return Response.json({
      items: result.items.map(serializeIndexedPact),
      nextCursor: result.nextCursor,
      indexedThroughId: result.indexedThroughId,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=8',
        'X-Indexer-Block': String(stats.lastSyncBlock),
        'X-Indexer-Lag': String(lagMs),
        'X-Indexer-Pacts': String(stats.totalPacts),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Indexer query failed'
    return Response.json({ error: message }, { status: 502 })
  }
}
