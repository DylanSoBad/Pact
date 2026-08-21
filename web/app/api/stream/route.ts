import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

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

      let currentBlock = 1845200n

      // Stream block heartbeats and pact updates every 6 seconds
      timer = setInterval(() => {
        if (isClosed) return

        currentBlock += 1n
        const blockEvent = JSON.stringify({
          type: 'block',
          blockNumber: currentBlock.toString(),
          timestamp: Date.now(),
          latencyMs: Math.floor(Math.random() * 40) + 120,
        })

        try {
          controller.enqueue(encoder.encode(`event: block\ndata: ${blockEvent}\n\n`))
        } catch {
          if (timer) clearInterval(timer)
          isClosed = true
        }
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
