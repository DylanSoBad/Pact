'use client'

import Link from 'next/link'
import type { PactData } from '../lib/reads'
import { formatDate } from '../lib/format'

type ActionItem = {
  pact: PactData
  title: string
  detail: string
  deadline: bigint
  urgent: boolean
}

export function actionsFor(pacts: PactData[], address: string, now: bigint): ActionItem[] {
  const account = address.toLowerCase()
  return pacts.flatMap(pact => {
    const isMaker = pact.maker.toLowerCase() === account
    const isTaker = pact.taker.toLowerCase() === account
    const isArbiter = pact.arbiter.toLowerCase() === account
    const soon = (deadline: bigint) => deadline > now && deadline - now <= 86_400n

    if (pact.status === 0 && isTaker) return [{ pact, title: 'Verify and accept offer', detail: 'Confirm the written terms before collateral is locked.', deadline: pact.offerExpiry, urgent: soon(pact.offerExpiry) }]
    if (pact.status === 0 && isMaker && now > pact.offerExpiry) return [{ pact, title: 'Expire unaccepted offer', detail: 'Recover maker collateral through pull-payment credits.', deadline: pact.offerExpiry, urgent: true }]
    if (pact.status === 1 && isTaker && now <= pact.performanceDeadline) return [{ pact, title: 'Submit fulfillment proof', detail: 'Anchor the proof reference before the performance window closes.', deadline: pact.performanceDeadline, urgent: soon(pact.performanceDeadline) }]
    if ((pact.status === 1 || pact.status === 2) && isMaker && now <= pact.disputeDeadline) return [{ pact, title: pact.status === 2 ? 'Review proof and settle' : 'Review active commitment', detail: 'Release collateral when fulfillment is verified, or dispute before cutoff.', deadline: pact.disputeDeadline, urgent: soon(pact.disputeDeadline) }]
    if ((pact.status === 1 || pact.status === 2) && (isMaker || isTaker) && now > pact.disputeDeadline) return [{ pact, title: 'Execute deadline settlement', detail: 'The dispute window has closed and settlement is available.', deadline: pact.disputeDeadline, urgent: true }]
    if (pact.status === 3 && isArbiter) return [{ pact, title: 'Review contested pact', detail: 'A ruling or timeout action may be required.', deadline: pact.disputeDeadline, urgent: true }]
    if (pact.status === 3 && (isMaker || isTaker)) return [{ pact, title: 'Respond to active dispute', detail: 'Open the pact to review your response or timeout rights.', deadline: pact.disputeDeadline, urgent: true }]
    return []
  }).sort((a, b) => a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : a.pact.id - b.pact.id)
}

export default function ActionCenter({ pacts, address }: { pacts: PactData[]; address: string }) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const actions = actionsFor(pacts, address, now)

  return (
    <section className="mb-6 border border-primary-fixed/35 bg-primary-fixed/[0.04] p-4 @md:p-5" aria-labelledby="action-center-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><p className="pact-eyebrow mb-1">Decision queue</p><h2 id="action-center-title" className="text-[17px] font-semibold text-white">Action Center</h2></div>
        <span className="font-display-mono text-[12px] text-primary-fixed">{actions.length} pending</span>
      </div>
      {actions.length === 0 ? (
        <p className="border border-outline-hairline bg-[#0c0d10] p-4 text-[12px] text-text-muted">No action is required from this wallet right now.</p>
      ) : (
        <div className="grid gap-2 @md:grid-cols-2">
          {actions.map(action => (
            <Link key={`${action.pact.id}-${action.title}`} href={`/p/${action.pact.id}`} className="group border border-outline-hairline bg-[#0c0d10] p-4 hover:border-primary-fixed/60">
              <div className="flex items-start justify-between gap-3"><span className="text-[12px] font-semibold text-white group-hover:text-primary-fixed">{action.title}</span><span className={`mt-1 h-2 w-2 shrink-0 ${action.urgent ? 'bg-status-error' : 'bg-status-warning'}`} /></div>
              <p className="mt-2 text-[11px] leading-5 text-text-muted">PACT #{String(action.pact.id).padStart(4, '0')} · {action.detail}</p>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-text-dim">Deadline {formatDate(action.deadline)} →</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
