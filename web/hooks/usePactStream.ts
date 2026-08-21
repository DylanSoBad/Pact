'use client'

import { useEffect, useRef } from 'react'
import { usePactStore } from '../lib/store/usePactStore'

export function usePactStream(onNewBlock?: (blockNumber: bigint) => void) {
  const { setBlockInfo, setSseConnected } = usePactStore()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)

  useEffect(() => {
    let active = true

    function connect() {
      if (!active) return

      try {
        const es = new EventSource('/api/stream')
        eventSourceRef.current = es

        es.onopen = () => {
          if (!active) return
          setSseConnected(true)
          retryCountRef.current = 0
        }

        es.addEventListener('connected', () => {
          if (!active) return
          setSseConnected(true)
        })

        es.addEventListener('block', (e: MessageEvent) => {
          if (!active) return
          try {
            const data = JSON.parse(e.data)
            const blockNum = BigInt(data.blockNumber)
            setBlockInfo(blockNum, data.timestamp)
            if (onNewBlock) {
              onNewBlock(blockNum)
            }
          } catch (err) {
            console.error('Error parsing SSE block event:', err)
          }
        })

        es.onerror = () => {
          if (!active) return
          setSseConnected(false)
          es.close()
          eventSourceRef.current = null

          // Exponential backoff reconnect
          const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 10000)
          retryCountRef.current += 1

          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = setTimeout(() => {
            if (active) connect()
          }, delay)
        }
      } catch (e) {
        console.warn('SSE EventSource not supported or initialization failed:', e)
      }
    }

    connect()

    return () => {
      active = false
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setSseConnected(false)
    }
  }, [setBlockInfo, setSseConnected, onNewBlock])
}
