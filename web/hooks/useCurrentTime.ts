'use client'

import { useState, useEffect } from 'react'

const listeners = new Set<(time: number) => void>()
let intervalId: NodeJS.Timeout | null = null
let sharedCurrentTime = Math.floor(Date.now() / 1000)

function tick() {
  sharedCurrentTime = Math.floor(Date.now() / 1000)
  listeners.forEach(fn => fn(sharedCurrentTime))
}

function startGlobalClock() {
  if (!intervalId && typeof window !== 'undefined') {
    sharedCurrentTime = Math.floor(Date.now() / 1000)
    intervalId = setInterval(tick, 1000)
  }
}

function stopGlobalClock() {
  if (intervalId && listeners.size === 0) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/**
 * Shared, synchronized 1-second clock hook for all countdown and deadline timers.
 * Prevents timer drift, reduces CPU wakeups, and coordinates synchronous UI updates.
 */
export function useCurrentTime(): number {
  const [time, setTime] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.floor(Date.now() / 1000)
    }
    return sharedCurrentTime
  })

  useEffect(() => {
    startGlobalClock()
    const listener = (newTime: number) => setTime(newTime)
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
      stopGlobalClock()
    }
  }, [])

  return time
}
