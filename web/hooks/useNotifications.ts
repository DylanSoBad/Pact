'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAccount, useReadContract, useChainId } from 'wagmi'
import {
  type PactNotification,
  type NotificationPreferences,
  type PactDataForNotification,
  type UserCreditsForNotification,
  DEFAULT_NOTIFICATION_PREFERENCES,
  evaluateDeadlineAlerts,
  loadNotificationPreferences,
  saveNotificationPreferences,
  loadReadNotificationIds,
  saveReadNotificationIds,
} from '../lib/notifications'
import { PACT_ABI } from '../lib/abi'
import { USDC_ERC20, EURC, getPactAddress } from '../lib/arc'

export function useNotifications(initialPacts?: PactDataForNotification[]) {
  const { address } = useAccount()
  const chainId = useChainId()
  const protocolAddress = getPactAddress(chainId)

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [rawPacts, setRawPacts] = useState<PactDataForNotification[]>(initialPacts || [])
  const [currentSec, setCurrentSec] = useState<number>(() => Math.floor(Date.now() / 1000))

  // Load preferences and read history on address change
  useEffect(() => {
    if (address) {
      setPreferences(loadNotificationPreferences(address))
      setReadIds(loadReadNotificationIds(address))
    } else {
      setPreferences(DEFAULT_NOTIFICATION_PREFERENCES)
      setReadIds(new Set())
    }
  }, [address])

  // Sync clock every 10s for deadline urgency transitions
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSec(Math.floor(Date.now() / 1000))
    }, 10_000)
    return () => clearInterval(timer)
  }, [])

  // Read on-chain credits for active user
  const { data: usdcCreditsData } = useReadContract({
    address: protocolAddress ?? undefined,
    abi: PACT_ABI,
    functionName: 'credits',
    args: address && protocolAddress ? [address, USDC_ERC20] : undefined,
    query: { enabled: Boolean(address && protocolAddress) },
  })

  const { data: eurcCreditsData } = useReadContract({
    address: protocolAddress ?? undefined,
    abi: PACT_ABI,
    functionName: 'credits',
    args: address && protocolAddress ? [address, EURC] : undefined,
    query: { enabled: Boolean(address && protocolAddress) },
  })

  const userCredits: UserCreditsForNotification[] = useMemo(() => {
    const list: UserCreditsForNotification[] = []
    if (usdcCreditsData && usdcCreditsData > 0n) {
      list.push({ token: USDC_ERC20, symbol: 'USDC', amount: usdcCreditsData })
    }
    if (eurcCreditsData && eurcCreditsData > 0n) {
      list.push({ token: EURC, symbol: 'EURC', amount: eurcCreditsData })
    }
    return list
  }, [usdcCreditsData, eurcCreditsData])

  // Fetch participant pacts from indexer when connected
  useEffect(() => {
    if (!address) {
      setRawPacts([])
      return
    }

    let isMounted = true
    const fetchParticipantPacts = async () => {
      try {
        const res = await fetch(`/api/pacts?account=${address}&limit=50`)
        if (!res.ok) return
        const data = await res.json() as { items?: PactDataForNotification[] }
        if (isMounted && data.items) {
          setRawPacts(data.items)
        }
      } catch {
        // Fallback silently if offline or indexer unavailable
      }
    }

    void fetchParticipantPacts()
    const pollInterval = setInterval(fetchParticipantPacts, 15_000)
    return () => {
      isMounted = false
      clearInterval(pollInterval)
    }
  }, [address])

  // Generate real-time notification list
  const notifications = useMemo(() => {
    const generated = evaluateDeadlineAlerts(
      rawPacts,
      currentSec,
      address,
      preferences,
      userCredits
    )

    return generated.map(n => ({
      ...n,
      read: readIds.has(n.id),
    }))
  }, [rawPacts, currentSec, address, preferences, userCredits, readIds])

  const unreadNotifications = useMemo(() => {
    return notifications.filter(n => !n.read)
  }, [notifications])

  const urgentNotifications = useMemo(() => {
    return notifications.filter(n => n.priority === 'critical' || n.priority === 'urgent')
  }, [notifications])

  const claimNotifications = useMemo(() => {
    return notifications.filter(n => n.category === 'withdrawals')
  }, [notifications])

  const markAsRead = useCallback((id: string) => {
    if (!address) return
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveReadNotificationIds(address, next)
      return next
    })
  }, [address])

  const markAllAsRead = useCallback(() => {
    if (!address) return
    const allIds = new Set(notifications.map(n => n.id))
    setReadIds(allIds)
    saveReadNotificationIds(address, allIds)
  }, [address, notifications])

  const updatePreferences = useCallback((newPrefs: NotificationPreferences) => {
    setPreferences(newPrefs)
    if (address) {
      saveNotificationPreferences(address, newPrefs)
    }
  }, [address])

  const clearAll = useCallback(() => {
    if (!address) return
    const allIds = new Set(notifications.map(n => n.id))
    setReadIds(allIds)
    saveReadNotificationIds(address, allIds)
  }, [address, notifications])

  return {
    notifications,
    unreadNotifications,
    unreadCount: unreadNotifications.length,
    urgentNotifications,
    claimNotifications,
    preferences,
    updatePreferences,
    markAsRead,
    markAllAsRead,
    clearAll,
  }
}
