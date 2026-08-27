import type { PactData } from './reads'
import { effectiveStatusLabel } from './format'

export type OverviewFilter = 'ALL' | 'DELIVERY' | 'JOB' | 'LIVE' | 'DISPUTED' | 'EXPIRED'

export type PortfolioRoleFilter = 'ALL' | 'MAKER' | 'TAKER' | 'ARBITER'
export type PortfolioStatusFilter = 'ALL' | 'ACTION_REQUIRED' | 'LIVE' | 'SETTLED' | 'EXPIRED' | 'DISPUTED'
export type PortfolioSortOrder = 'DEADLINE' | 'NEWEST' | 'VALUE'

export interface PortfolioFilterCriteria {
  role: PortfolioRoleFilter
  status: PortfolioStatusFilter
  accountAddress?: string
  currentNowTs?: bigint
  searchQuery?: string
  sortOrder?: PortfolioSortOrder
}

/**
 * Returns the currently active countdown deadline for a pact based on its status.
 */
export function getRelevantDeadline(pact: PactData): bigint {
  if (pact.status === 0) return pact.offerExpiry
  if (pact.status === 1) return pact.performanceDeadline
  if (pact.status === 2 || pact.status === 3) return pact.disputeDeadline
  return pact.updatedAt
}

/**
 * Determines if an active pact currently requires an action from a given account.
 */
export function requiresActionFrom(pact: PactData, address: string, nowTs: bigint): boolean {
  if (!address) return false
  const account = address.toLowerCase()
  const isMaker = pact.maker.toLowerCase() === account
  const isTaker = pact.taker.toLowerCase() === account
  const isArbiter = pact.arbiter.toLowerCase() === account

  // 0: OFFERED
  if (pact.status === 0) {
    if (isTaker && nowTs <= pact.offerExpiry) return true // Taker can accept
    if (isMaker && nowTs > pact.offerExpiry) return true  // Maker can expire
    return false
  }

  // 1: ACTIVE
  if (pact.status === 1) {
    if (isTaker && nowTs <= pact.performanceDeadline) return true // Taker can submit proof
    if (isMaker && nowTs > pact.disputeDeadline) return true      // Maker can refund after deadline
    return false
  }

  // 2: PROOF SUBMITTED
  if (pact.status === 2) {
    if (isMaker && nowTs <= pact.disputeDeadline) return true // Maker can release or dispute
    if (isTaker && nowTs > pact.disputeDeadline) return true  // Taker can claim payout
    return false
  }

  // 3: DISPUTED
  if (pact.status === 3) {
    if (isArbiter) return true // Arbiter review
    return true // Parties involved in dispute
  }

  return false
}

/**
 * Computes active capital currently committed at stake by a specific user across active pacts.
 */
export function computeActiveCapitalAtStake(pacts: PactData[], address: string): {
  makerCollateral: bigint
  takerCollateral: bigint
  totalAtStake: bigint
  activePactsCount: number
} {
  if (!address) return { makerCollateral: 0n, takerCollateral: 0n, totalAtStake: 0n, activePactsCount: 0 }
  const account = address.toLowerCase()
  let makerCollateral = 0n
  let takerCollateral = 0n
  let activePactsCount = 0

  for (const p of pacts) {
    const isLive = p.status >= 0 && p.status <= 3
    if (!isLive) continue

    const isMaker = p.maker.toLowerCase() === account
    const isTaker = p.taker.toLowerCase() === account

    if (isMaker) {
      makerCollateral += p.collateralMaker
      activePactsCount++
    }
    if (isTaker) {
      takerCollateral += p.collateralTaker
      if (!isMaker) activePactsCount++
    }
  }

  return {
    makerCollateral,
    takerCollateral,
    totalAtStake: makerCollateral + takerCollateral,
    activePactsCount,
  }
}

/**
 * Computes pact counts partitioned by role for a given user account.
 */
export function computeRoleCounts(pacts: PactData[], address: string): {
  ALL: number
  MAKER: number
  TAKER: number
  ARBITER: number
} {
  if (!address) return { ALL: pacts.length, MAKER: 0, TAKER: 0, ARBITER: 0 }
  const account = address.toLowerCase()
  return {
    ALL: pacts.length,
    MAKER: pacts.filter(p => p.maker.toLowerCase() === account).length,
    TAKER: pacts.filter(p => p.taker.toLowerCase() === account).length,
    ARBITER: pacts.filter(p => p.arbiter.toLowerCase() === account).length,
  }
}

/**
 * Pure filter function for Overview / The Tape with search support.
 */
export function filterOverviewPacts(
  pacts: PactData[],
  filter: OverviewFilter,
  nowTs?: bigint,
  searchQuery?: string
): PactData[] {
  const now = nowTs ?? BigInt(Math.floor(Date.now() / 1000))
  const q = searchQuery?.trim().toLowerCase() ?? ''

  return pacts.filter((p) => {
    if (q) {
      const matchId = String(p.id).includes(q.replace('#', ''))
      const matchMaker = p.maker.toLowerCase().includes(q)
      const matchTaker = p.taker.toLowerCase().includes(q)
      const matchTerms = p.termsHash.toLowerCase().includes(q)
      if (!matchId && !matchMaker && !matchTaker && !matchTerms) return false
    }

    if (filter === 'ALL') return true
    if (filter === 'DELIVERY') return p.kind === 0
    if (filter === 'JOB') return p.kind === 1
    if (filter === 'LIVE') return p.status >= 1 && p.status <= 3
    if (filter === 'DISPUTED') return p.status === 3

    if (filter === 'EXPIRED') {
      const eff = effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline, now)
      return eff === 'EXPIRED' || p.status === 6
    }

    return true
  })
}

/**
 * Pure filter and sort function for Portfolio / My Pacts with combined Role, Status, Search, and Priority Sort criteria.
 */
export function filterPortfolioPacts(pacts: PactData[], criteria: PortfolioFilterCriteria): PactData[] {
  const { role, status, accountAddress, currentNowTs, searchQuery, sortOrder = 'DEADLINE' } = criteria
  const now = currentNowTs ?? BigInt(Math.floor(Date.now() / 1000))
  const account = accountAddress?.toLowerCase() ?? ''
  const q = searchQuery?.trim().toLowerCase() ?? ''

  const filtered = pacts.filter((p) => {
    if (q) {
      const matchId = String(p.id).includes(q.replace('#', ''))
      const matchMaker = p.maker.toLowerCase().includes(q)
      const matchTaker = p.taker.toLowerCase().includes(q)
      const matchTerms = p.termsHash.toLowerCase().includes(q)
      if (!matchId && !matchMaker && !matchTaker && !matchTerms) return false
    }

    // 1. Role Filter
    if (role === 'MAKER' && account && p.maker.toLowerCase() !== account) return false
    if (role === 'TAKER' && account && p.taker.toLowerCase() !== account) return false
    if (role === 'ARBITER' && account && p.arbiter.toLowerCase() !== account) return false

    // 2. Status Filter
    if (status === 'ACTION_REQUIRED') {
      return requiresActionFrom(p, account, now)
    }

    if (status === 'LIVE') {
      return p.status >= 0 && p.status <= 3
    }

    if (status === 'DISPUTED') {
      return p.status === 3
    }

    if (status === 'SETTLED') {
      return p.status === 4
    }

    if (status === 'EXPIRED') {
      const eff = effectiveStatusLabel(p.status, p.offerExpiry, p.disputeDeadline, now)
      return eff === 'EXPIRED' || p.status === 5 || p.status === 6
    }

    return true
  })

  // 3. Priority Sorting
  return filtered.sort((a, b) => {
    if (sortOrder === 'NEWEST') {
      return b.id - a.id
    }

    if (sortOrder === 'VALUE') {
      const valA = a.collateralMaker + a.collateralTaker
      const valB = b.collateralMaker + b.collateralTaker
      if (valB > valA) return 1
      if (valB < valA) return -1
      return b.id - a.id
    }

    // Default 'DEADLINE': Prioritize active pacts with earliest deadline first, then terminal
    const isLiveA = a.status >= 0 && a.status <= 3
    const isLiveB = b.status >= 0 && b.status <= 3

    if (isLiveA && !isLiveB) return -1
    if (!isLiveA && isLiveB) return 1

    if (isLiveA && isLiveB) {
      const deadA = getRelevantDeadline(a)
      const deadB = getRelevantDeadline(b)
      if (deadA < deadB) return -1
      if (deadA > deadB) return 1
    }

    return b.id - a.id
  })
}
