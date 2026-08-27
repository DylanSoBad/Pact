'use client'

import { useEffect, useState } from 'react'

export default function Countdown({ deadlineTs }: { deadlineTs: bigint }) {
  const [timeLeft, setTimeLeft] = useState('')
  const [isPast, setIsPast] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000)
      const diff = Number(deadlineTs) - now

      if (diff <= 0) {
        setTimeLeft('EXPIRED / READY TO SETTLE')
        setIsPast(true)
        setIsUrgent(false)
        return
      }

      setIsPast(false)
      setIsUrgent(diff <= 86400) // Under 24h

      const days = Math.floor(diff / 86400)
      const h = Math.floor((diff % 86400) / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60

      const dStr = days > 0 ? `${days}d ` : ''
      const hStr = h > 0 || days > 0 ? `${h}h ` : ''
      setTimeLeft(`${dStr}${hStr}${m}m ${s}s`)
    }

    update()
    const int = setInterval(update, 1000)
    return () => clearInterval(int)
  }, [deadlineTs])

  return (
    <div className="flex items-center gap-2 font-code-hash text-[12px]">
      <span className="text-text-muted">Countdown:</span>
      <span className={`font-bold tabular-nums ${
        isPast
          ? 'text-rose-400'
          : isUrgent
          ? 'text-amber-400'
          : 'text-primary-fixed'
      }`}>
        {timeLeft}
      </span>
    </div>
  )
}
