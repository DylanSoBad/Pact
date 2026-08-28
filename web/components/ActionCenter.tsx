'use client'

import Link from 'next/link'
import type { PactData } from '../lib/reads'
import { formatDate } from '../lib/format'

import { type ActionType, type ActionRole, type ActionSeverity } from '../lib/actionMatrix'
import RoleBadge, { type RoleType } from './RoleBadge'

export type ActionItem = {
  pact: PactData
  title: string
  detail: string
  deadline: bigint
  urgent: boolean
  actionType?: ActionType
  role?: ActionRole
  severity?: ActionSeverity
}

export function actionsFor(pacts: PactData[], address: string, now: bigint): ActionItem[] {
  if (!address) return []
  const account = address.toLowerCase()
  return pacts.flatMap((pact): ActionItem[] => {
    const isMaker = pact.maker.toLowerCase() === account
    const isTaker = pact.taker.toLowerCase() === account
    const isArbiter = pact.arbiter.toLowerCase() === account
    const soon = (deadline: bigint) => deadline > now && deadline - now <= 86_400n

    // 0: OFFERED
    if (pact.status === 0) {
      if (isTaker && now <= pact.offerExpiry) {
        return [{
          pact,
          title: 'Verify and accept offer',
          detail: 'Confirm written terms and lock counterparty collateral to activate agreement.',
          deadline: pact.offerExpiry,
          urgent: soon(pact.offerExpiry),
          actionType: 'ACCEPT_OFFER',
          role: 'TAKER',
          severity: 'primary',
        }]
      }
      if (isMaker && now > pact.offerExpiry) {
        return [{
          pact,
          title: 'Expire unaccepted offer',
          detail: 'Offer expired without acceptance. Claim maker collateral refund to pull-payment credits.',
          deadline: pact.offerExpiry,
          urgent: true,
          actionType: 'EXPIRE_OFFER',
          role: 'MAKER',
          severity: 'primary',
        }]
      }
      if (!isMaker && now > pact.offerExpiry) {
        return [{
          pact,
          title: 'Offer expired',
          detail: 'Acceptance window closed. Permissionless settlement available to return funds to maker.',
          deadline: pact.offerExpiry,
          urgent: false,
          actionType: 'EXPIRE_OFFER',
          role: 'PUBLIC',
          severity: 'neutral',
        }]
      }
    }

    // 1: ACTIVE
    if (pact.status === 1) {
      if (isTaker && now <= pact.performanceDeadline) {
        return [{
          pact,
          title: 'Submit fulfillment proof',
          detail: 'Anchor delivery or milestone proof before performance window closes.',
          deadline: pact.performanceDeadline,
          urgent: soon(pact.performanceDeadline),
          actionType: 'SUBMIT_PROOF',
          role: 'TAKER',
          severity: 'primary',
        }]
      }
      if (isMaker && now <= pact.disputeDeadline) {
        const pastPerf = now > pact.performanceDeadline
        return [{
          pact,
          title: pastPerf ? 'Review missed performance cutoff' : 'Review active commitment',
          detail: pastPerf
            ? 'Performance window elapsed without proof. Open dispute before cutoff or release collateral.'
            : 'Release collateral to settle, or open dispute before cutoff.',
          deadline: pact.disputeDeadline,
          urgent: soon(pact.disputeDeadline),
          actionType: 'RELEASE_COLLATERAL',
          role: 'MAKER',
          severity: 'primary',
        }]
      }
      if (now > pact.disputeDeadline) {
        return [{
          pact,
          title: isMaker ? 'Claim full collateral refund (Deadline settlement)' : 'Dispute window closed',
          detail: isMaker
            ? 'Dispute window closed with no proof submitted. Settle pact to claim 100% collateral refund.'
            : 'Performance and dispute window elapsed without delivery proof. Funds revert to maker.',
          deadline: pact.disputeDeadline,
          urgent: true,
          actionType: 'DEADLINE_REFUND_MAKER',
          role: isMaker ? 'MAKER' : 'PUBLIC',
          severity: isMaker ? 'primary' : 'neutral',
        }]
      }
    }

    // 2: PROOF SUBMITTED
    if (pact.status === 2) {
      if (isMaker && now <= pact.disputeDeadline) {
        return [{
          pact,
          title: 'Review proof and settle',
          detail: 'Proof submitted by counterparty. Release collateral to settle or open dispute before cutoff.',
          deadline: pact.disputeDeadline,
          urgent: soon(pact.disputeDeadline),
          actionType: 'RELEASE_COLLATERAL',
          role: 'MAKER',
          severity: 'primary',
        }]
      }
      if (isTaker && now <= pact.disputeDeadline) {
        return [{
          pact,
          title: 'Proof submitted (Awaiting review)',
          detail: 'Proof anchored on-chain. Maker has until dispute cutoff to release collateral or dispute.',
          deadline: pact.disputeDeadline,
          urgent: soon(pact.disputeDeadline),
          actionType: 'SUBMIT_PROOF',
          role: 'TAKER',
          severity: 'neutral',
        }]
      }
      if (now > pact.disputeDeadline) {
        return [{
          pact,
          title: isTaker ? 'Claim collateral & payout (Deadline settlement)' : 'Execute final settlement',
          detail: isTaker
            ? 'Dispute window closed with proof unchallenged. Settle pact to claim 100% collateral and payment.'
            : 'Dispute window closed with proof unchallenged. Finalize settlement to release funds to counterparty.',
          deadline: pact.disputeDeadline,
          urgent: true,
          actionType: 'DEADLINE_SETTLE_TAKER',
          role: isTaker ? 'TAKER' : 'PUBLIC',
          severity: isTaker ? 'primary' : 'neutral',
        }]
      }
    }

    // 3: DISPUTED
    if (pact.status === 3) {
      if (isArbiter) {
        return [{
          pact,
          title: 'Review contested pact',
          detail: 'Both parties bonded. Arbiter ruling or timeout action is required.',
          deadline: pact.disputeDeadline,
          urgent: true,
          actionType: 'RULE_DISPUTE_MAKER',
          role: 'ARBITER',
          severity: 'primary',
        }]
      }
      if (isMaker || isTaker) {
        return [{
          pact,
          title: 'Respond to active dispute',
          detail: 'Dispute active. Review response deadlines, counter-bonds, and ruling status.',
          deadline: pact.disputeDeadline,
          urgent: true,
          actionType: 'RESPOND_DISPUTE',
          role: isMaker ? 'MAKER' : 'TAKER',
          severity: 'warning',
        }]
      }
    }

    return []
  }).sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : a.pact.id - b.pact.id))
}

import { useCurrentTime } from '../hooks/useCurrentTime'
import { getDeadlineStatus } from '../lib/countdown'

export default function ActionCenter({ pacts, address }: { pacts: PactData[]; address?: string }) {
  const currentTime = useCurrentTime()
  const actions = actionsFor(pacts, address ?? '', BigInt(currentTime))

  return (
    <section aria-label="Action Center" className="border border-outline-border bg-[#0c0f12] p-5 animate-enter">
      <div className="flex items-center justify-between pb-3 border-b border-outline-hairline mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary-fixed">pending_actions</span>
          <h2 className="font-headline-mono text-[13px] font-bold uppercase tracking-wider text-white">
            Action Center
          </h2>
        </div>
        <span className="text-[11px] font-code-hash text-text-dim">
          {actions.length} {actions.length === 1 ? 'Action Required' : 'Actions Required'}
        </span>
      </div>

      {actions.length === 0 ? (
        <div className="p-4 border border-outline-hairline bg-[#07080a] text-center font-code-hash text-[12px] text-text-dim">
          No pending actions required. You are fully up-to-date across all active pacts.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => {
            const deadlineStatus = getDeadlineStatus(action.deadline, currentTime)
            const isCardUrgent = action.urgent || deadlineStatus.isUrgent
            const isCardPast = deadlineStatus.isExpired

            return (
              <Link
                key={`${action.pact.id}-${action.title}`}
                href={`/p/${action.pact.id}`}
                className={`group flex flex-col justify-between border p-4 transition-colors focus-visible:ring-2 focus-visible:ring-primary-fixed ${
                  isCardUrgent
                    ? 'border-orange-500/40 bg-orange-950/15 hover:border-orange-400'
                    : isCardPast
                    ? 'border-rose-500/40 bg-rose-950/15 hover:border-rose-400'
                    : 'border-outline-border bg-[#07080a] hover:border-primary-fixed'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-headline-mono text-[13px] font-bold text-white group-hover:text-primary-fixed transition-colors">
                        {action.title}
                      </span>
                      {action.role && (
                        <RoleBadge
                          role={action.role as RoleType}
                          isCurrentUser={true}
                          size="xs"
                        />
                      )}
                    </div>
                    <span className={`px-2 py-0.5 font-label-caps text-[9px] uppercase tracking-wider font-bold shrink-0 ${deadlineStatus.badgeStyle}`}>
                      {isCardPast ? 'EXPIRED' : isCardUrgent ? 'URGENT' : 'PENDING'}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-text-muted font-body-sans">
                    <strong className="text-white font-code-hash">#{String(action.pact.id).padStart(4, '0')}</strong> · {action.detail}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-outline-hairline/60 flex items-center justify-between text-[11px] font-code-hash text-text-dim flex-wrap gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className={`font-bold tabular-nums ${deadlineStatus.textColor}`}>
                      {isCardPast ? '⌛ EXPIRED' : `⏱ ${deadlineStatus.compactFormatted}`}
                    </span>
                    <span className="text-text-dim">· Cutoff: {formatDate(action.deadline)}</span>
                  </span>
                  <span className="text-primary-fixed group-hover:translate-x-0.5 transition-transform font-bold shrink-0 inline-flex items-center gap-1">
                    <span>Execute Action</span>
                    <span>→</span>
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
