'use client'

import Link from 'next/link'
import type { PactData } from '../lib/reads'
import { formatDate } from '../lib/format'

export type ActionItem = {
  pact: PactData
  title: string
  detail: string
  deadline: bigint
  urgent: boolean
}

export function actionsFor(pacts: PactData[], address: string, now: bigint): ActionItem[] {
  if (!address) return []
  const account = address.toLowerCase()
  return pacts.flatMap(pact => {
    const isMaker = pact.maker.toLowerCase() === account
    const isTaker = pact.taker.toLowerCase() === account
    const isArbiter = pact.arbiter.toLowerCase() === account
    const soon = (deadline: bigint) => deadline > now && deadline - now <= 86_400n

    if (pact.status === 0 && isTaker) {
      return [{
        pact,
        title: 'Verify and accept offer',
        detail: 'Confirm written terms and lock counterparty collateral to activate agreement.',
        deadline: pact.offerExpiry,
        urgent: soon(pact.offerExpiry),
      }]
    }
    if (pact.status === 0 && isMaker && now > pact.offerExpiry) {
      return [{
        pact,
        title: 'Expire unaccepted offer',
        detail: 'Offer expired without acceptance. Claim maker collateral refund.',
        deadline: pact.offerExpiry,
        urgent: true,
      }]
    }
    if (pact.status === 1 && isTaker && now <= pact.performanceDeadline) {
      return [{
        pact,
        title: 'Submit fulfillment proof',
        detail: 'Anchor delivery or milestone proof before performance window closes.',
        deadline: pact.performanceDeadline,
        urgent: soon(pact.performanceDeadline),
      }]
    }
    if ((pact.status === 1 || pact.status === 2) && isMaker && now <= pact.disputeDeadline) {
      return [{
        pact,
        title: pact.status === 2 ? 'Review proof and settle' : 'Review active commitment',
        detail: 'Release collateral to settle, or open dispute before cutoff.',
        deadline: pact.disputeDeadline,
        urgent: soon(pact.disputeDeadline),
      }]
    }
    if ((pact.status === 1 || pact.status === 2) && (isMaker || isTaker) && now > pact.disputeDeadline) {
      return [{
        pact,
        title: 'Execute deadline settlement',
        detail: 'Dispute window closed. Settle and release funds.',
        deadline: pact.disputeDeadline,
        urgent: true,
      }]
    }
    if (pact.status === 3 && isArbiter) {
      return [{
        pact,
        title: 'Review contested pact',
        detail: 'Both parties bonded. Arbiter ruling or timeout action is required.',
        deadline: pact.disputeDeadline,
        urgent: true,
      }]
    }
    if (pact.status === 3 && (isMaker || isTaker)) {
      return [{
        pact,
        title: 'Respond to active dispute',
        detail: 'Dispute active. Review response deadlines, counter-bonds, and ruling status.',
        deadline: pact.disputeDeadline,
        urgent: true,
      }]
    }
    return []
  }).sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : a.pact.id - b.pact.id))
}

export default function ActionCenter({ pacts, address }: { pacts: PactData[]; address: string }) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const actions = actionsFor(pacts, address, now)

  return (
    <section aria-labelledby="action-center-title" className="mb-6 border border-primary-fixed/30 bg-[#0c0f12] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-outline-hairline">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary-fixed" aria-hidden="true">
            task_alt
          </span>
          <div>
            <h2 id="action-center-title" className="font-headline-mono text-[14px] font-bold uppercase tracking-wider text-white">
              Action Center
            </h2>
            <p className="text-[11px] text-text-muted">
              Commitments requiring signature, proof verification, or settlement from this wallet.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 border border-outline-border bg-[#12161b] font-label-caps text-[10px] font-bold uppercase tracking-wider text-primary-fixed">
          {actions.length} {actions.length === 1 ? 'Action' : 'Actions'}
        </span>
      </div>

      {actions.length === 0 ? (
        <div className="p-4 border border-outline-hairline bg-[#07080a] text-[12px] text-text-muted flex items-center gap-2 font-code-hash">
          <span className="text-emerald-400">✓</span>
          <span>No pending actions required from this wallet right now. All commitments are up to date.</span>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <Link
              key={`${action.pact.id}-${action.title}`}
              href={`/p/${action.pact.id}`}
              className="group flex flex-col justify-between border border-outline-border bg-[#07080a] p-4 transition-colors hover:border-primary-fixed focus-visible:ring-2 focus-visible:ring-primary-fixed"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-headline-mono text-[13px] font-bold text-white group-hover:text-primary-fixed transition-colors">
                    {action.title}
                  </span>
                  <span className={`px-2 py-0.5 font-label-caps text-[9px] uppercase tracking-wider font-bold shrink-0 ${
                    action.urgent
                      ? 'border border-status-error/40 bg-status-error/10 text-status-error'
                      : 'border border-primary-fixed/40 bg-primary-fixed/10 text-primary-fixed'
                  }`}>
                    {action.urgent ? 'URGENT' : 'PENDING'}
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-text-muted font-body-sans">
                  <strong className="text-white font-code-hash">#{String(action.pact.id).padStart(4, '0')}</strong> · {action.detail}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-outline-hairline/60 flex items-center justify-between text-[11px] font-code-hash text-text-dim">
                <span>Cutoff: {formatDate(action.deadline)}</span>
                <span className="text-primary-fixed group-hover:translate-x-0.5 transition-transform font-bold">
                  Open Pact →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
