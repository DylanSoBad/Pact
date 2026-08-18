'use client'

import { useEffect, useState } from 'react'

export default function Countdown({ deadlineTs }: { deadlineTs: bigint }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000)
      const diff = Number(deadlineTs) - now

      if (diff <= 0) {
        setTimeLeft('DEADLINE REACHED')
        return
      }

      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60

      const hStr = h > 0 ? `${h}h ` : ''
      setTimeLeft(`${hStr}${m}m ${s}s`)
    }

    update()
    const int = setInterval(update, 1000)
    return () => clearInterval(int)
  }, [deadlineTs])

  return <span className="font-mono">{timeLeft}</span>
}
