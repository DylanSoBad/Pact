import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network'

async function getLatestBlock(signal: AbortSignal): Promise<{ blockNumber: string; latencyMs: number }> {
  const startedAt = performance.now()
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`Arc RPC returned HTTP ${response.status}`)
  const payload = await response.json() as { result?: string; error?: { message?: string } }
  if (!payload.result) throw new Error(payload.error?.message || 'Arc RPC returned no block number')
  return {
    blockNumber: BigInt(payload.result).toString(),
    latencyMs: Math.round(performance.now() - startedAt),
  }
}

export async function GET(req: NextRequest) {
  let isClosed = false
  let timer: NodeJS.Timeout | null = null

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      // Initial connection established payload
      const initialPayload = JSON.stringify({
        type: 'connected',
        timestamp: Date.now(),
        network: 'arc-testnet',
        chainId: 5042002,
      })
      controller.enqueue(encoder.encode(`event: connected\ndata: ${initialPayload}\n\n`))

      const publishLatestBlock = async () => {
        if (isClosed) return
        try {
          const latest = await getLatestBlock(req.signal)
          const blockEvent = JSON.stringify({ type: 'block', ...latest, timestamp: Date.now() })
          controller.enqueue(encoder.encode(`event: block\ndata: ${blockEvent}\n\n`))
        } catch (error) {
          if (req.signal.aborted || isClosed) return
          const message = error instanceof Error ? error.message : 'Arc RPC unavailable'
          const errorEvent = JSON.stringify({ type: 'rpc-error', message, timestamp: Date.now() })
          controller.enqueue(encoder.encode(`event: rpc-error\ndata: ${errorEvent}\n\n`))
        }
      }

      void publishLatestBlock()
      timer = setInterval(() => {
        void publishLatestBlock().catch(() => {
          if (timer) clearInterval(timer)
          isClosed = true
        })
      }, 6000)

      req.signal.addEventListener('abort', () => {
        isClosed = true
        if (timer) clearInterval(timer)
        try {
          controller.close()
        } catch {
          // ignore
        }
      })
    },
    cancel() {
      isClosed = true
      if (timer) clearInterval(timer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, max-age=0',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
