import { NextRequest } from 'next/server'
import { getIndexer, getPactById, serializeIndexedPact } from '../../../../lib/indexer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pacts/[id] — O(1) single pact lookup from materialized view.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params
  const id = Number(rawId)

  if (!Number.isFinite(id) || id < 1 || !Number.isSafeInteger(id)) {
    return Response.json({ error: 'Invalid pact ID' }, { status: 400 })
  }

  // Ensure indexer is initialized
  const { stats } = await getIndexer()
  const pact = getPactById(id)

  if (!pact) {
    return Response.json({ error: `Pact #${id} not found` }, { status: 404 })
  }

  return Response.json({
    pact: serializeIndexedPact(pact),
  }, {
    headers: {
      'Cache-Control': pact.status >= 4
        ? 'public, s-maxage=60, stale-while-revalidate=300'
        : 'public, s-maxage=2, stale-while-revalidate=5',
      'X-Indexer-Block': String(stats.lastSyncBlock),
    },
  })
}
