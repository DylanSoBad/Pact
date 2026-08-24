type SafeContext = Record<string, string | number | boolean | null>

function normalizedError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name.slice(0, 80), message: error.message.slice(0, 500) }
  }
  return { name: 'UnknownError', message: String(error).slice(0, 500) }
}

/**
 * Reports operational errors without wallet addresses, pact terms, transaction
 * calldata, or stack traces. The collector is optional and build-time configured.
 */
export function captureClientError(error: unknown, context: SafeContext = {}) {
  if (typeof window === 'undefined') return
  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORT_URL
  if (!endpoint) return

  const body = JSON.stringify({
    ...normalizedError(error),
    context,
    path: window.location.pathname,
    occurredAt: new Date().toISOString(),
  })

  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
    return
  }
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}
