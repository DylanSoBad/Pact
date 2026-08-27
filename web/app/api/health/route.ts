import { getIndexerHealth } from '../../../lib/indexer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health — Indexer monitoring endpoint.
 *
 * Returns current indexer state, lag, block height, and stats.
 * 200 if ok, 503 if down.
 */
export async function GET() {
  const health = getIndexerHealth()

  const statusCode = health.status === 'down' ? 503 : 200

  return Response.json(health, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
