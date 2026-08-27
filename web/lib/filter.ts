import type { PactData } from './reads'
import { effectiveStatusLabel } from './format'

export type OverviewFilter = 'ALL' | 'DELIVERY' | 'JOB' | 'LIVE' | 'DISPUTED' | 'EXPIRED'

export type PortfolioRoleFilter = 'ALL' | 'MAKER' | 'TAKER'
export type PortfolioStatusFilter = 'ALL' | 'ACTION_REQUIRED' | 'LIVE' | 'SETTLED' | 'EXPIRED' | 'DISPUTED'

export interface PortfolioFilterCriteria {
  role: PortfolioRoleFilter
  status: PortfolioStatusFilter
  accountAddress?: string
  currentNowTs?: bigint
  searchQuery?: string
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
 * Pure filter function for Portfolio / My Pacts with combined Role, Status, and Search criteria.
 */
export function filterPortfolioPacts(pacts: PactData[], criteria: PortfolioFilterCriteria): PactData[] {
  const { role, status, accountAddress, currentNowTs, searchQuery } = criteria
  const now = currentNowTs ?? BigInt(Math.floor(Date.now() / 1000))
  const account = accountAddress?.toLowerCase() ?? ''
  const q = searchQuery?.trim().toLowerCase() ?? ''

  return pacts.filter((p) => {
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
}
