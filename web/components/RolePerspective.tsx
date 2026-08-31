'use client'

import { useState, useRef } from 'react'
import RolePerspectiveModal from './RolePerspectiveModal'

export type ProtocolRole = 'MAKER' | 'COUNTERPARTY' | 'ARBITER'

interface RoleDetail {
  id: ProtocolRole
  title: string
  subtitle: string
  badge: string
  objective: string
  responsibilities: string[]
  keyAction: string
  safetyFeature: string
}

export const ROLE_DETAILS: Record<ProtocolRole, RoleDetail> = {
  MAKER: {
    id: 'MAKER',
    title: 'Maker / Escrow Depositor',
    subtitle: 'Initiates written commitments and locks the primary capital escrow.',
    badge: 'CAPITAL DEPOSITOR',
    objective: 'Create exact contractual terms, authorize collateral, and verify proof of execution before clearing payout.',
    responsibilities: [
      'Drafts plaintext agreement terms and anchors cryptographic digest on-chain.',
      'Deposits exact ERC-20 payment amount plus required collateral into non-custodial vault.',
      'Inspects delivered proof during review window before release or escalation.',
      'Releases funds immediately upon satisfaction or initiates bonded dispute resolution.',
    ],
    keyAction: 'Draft Agreement → Authorize Exact Vault Deposit → Review Proof → Release Funds',
    safetyFeature: 'Automatic refund upon offer expiry if taker fails to accept, plus 5% bonded dispute recourse.',
  },
  COUNTERPARTY: {
    id: 'COUNTERPARTY',
    title: 'Counterparty / Performer',
    subtitle: 'Accepts terms, locks execution stake, and delivers agreed off-chain obligations.',
    badge: 'OBLIGATION PERFORMER',
    objective: 'Accept binding terms, commit mutual performance collateral, execute deliverables, and claim programmatic payout.',
    responsibilities: [
      'Reviews terms hash and counterparties before signing on-chain acceptance.',
      'Locks counterparty performance collateral to prove commitment and skin-in-the-game.',
      'Completes off-chain delivery and submits cryptographic proof digest before performance deadline.',
      'Claims full settlement payout automatically if review period passes without dispute.',
    ],
    keyAction: 'Verify Terms → Lock Counter-Collateral → Execute Obligation → Submit Proof Digest',
    safetyFeature: 'Autonomous payout release if Maker goes unresponsive after proof submission.',
  },
  ARBITER: {
    id: 'ARBITER',
    title: 'Designated Arbiter',
    subtitle: 'Neutral adjudicator called only if a bonded dispute is initiated.',
    badge: 'DISPUTE RESOLVER',
    objective: 'Inspect contested evidence against the on-chain terms hash and execute binding capital distribution.',
    responsibilities: [
      'Designated at contract creation by mutual consent of Maker and Counterparty.',
      'Activated strictly when either party locks a 5% dispute bond during the review window.',
      'Compares submitted proof directly against the immutable terms hash.',
      'Executes deterministic settlement resolution and claims capped arbiter fee from the losing bond.',
    ],
    keyAction: 'Inspect Evidence → Evaluate Terms Hash → Execute Binding Split → Settle Vault',
    safetyFeature: 'Arbiter cannot access funds outside an active bonded dispute, protecting capital integrity.',
  },
}

export default function RolePerspective() {
  const [selectedRole, setSelectedRole] = useState<ProtocolRole>('MAKER')
  const [modalOpen, setModalOpen] = useState(false)
  const tabRefs = useRef<{ [key in ProtocolRole]?: HTMLButtonElement | null }>({})

  const roles: ProtocolRole[] = ['MAKER', 'COUNTERPARTY', 'ARBITER']
  const current = ROLE_DETAILS[selectedRole]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentRole: ProtocolRole) => {
    const currentIndex = roles.indexOf(currentRole)
    let nextIndex = currentIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % roles.length
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + roles.length) % roles.length
      e.preventDefault()
    } else if (e.key === 'Home') {
      nextIndex = 0
      e.preventDefault()
    } else if (e.key === 'End') {
      nextIndex = roles.length - 1
      e.preventDefault()
    }

    if (nextIndex !== currentIndex) {
      const nextRole = roles[nextIndex]
      setSelectedRole(nextRole)
      tabRefs.current[nextRole]?.focus()
    }
  }

  return (
    <section
      aria-label="Protocol Role Perspective"
      className="relative w-full border-b border-outline-hairline bg-[#090c0f] py-16 sm:py-20"
    >
      <div className="mx-auto max-w-[1368px] px-4 sm:px-8 lg:px-14">
        {/* Section Header with Educational Context */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-8 border-b border-outline-hairline">
          <div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 rounded-[1px] bg-primary-fixed" />
              <p className="font-label-caps text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fixed">
                Role Matrix
              </p>
            </div>
            <h2 className="mt-3 font-editorial text-[28px] font-normal leading-[1.15] tracking-[-0.025em] text-[#f4f5f7] sm:text-[36px]">
              How PACT works from your vantage point.
            </h2>
            <p className="mt-2 font-body-sans text-[13px] text-text-muted max-w-xl">
              Understand the rights, collateral commitments, and execution safeguards for each participant.
            </p>
          </div>

          {/* Actions & Educational Disclaimer Badge */}
          <div className="flex flex-wrap items-center gap-2.5">
            <RolePerspectiveModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 border border-outline-border bg-[#0c0f12] px-3 font-label-caps text-[10px] uppercase tracking-wider text-text-muted hover:border-primary-fixed hover:text-white transition-colors rounded-[1px]"
            >
              <span className="material-symbols-outlined text-[14px] text-primary-fixed" aria-hidden="true">open_in_full</span>
              <span>Open Guide Modal</span>
            </button>
            <div className="shrink-0 font-code-hash text-[10px] text-text-dim border border-outline-hairline bg-[#0c0f12] px-3 py-1.5 rounded-[1px]">
              <span className="text-primary-fixed">ℹ</span> Educational perspective switcher · Does not alter wallet role
            </div>
          </div>
        </div>

        {/* Tab Controls (Segmented Bar) */}
        <div className="mt-8">
          <div
            role="tablist"
            aria-label="Protocol participant roles"
            className="flex flex-wrap items-center gap-2 border-b border-outline-hairline/60 pb-3"
          >
            {roles.map((role) => {
              const active = selectedRole === role
              return (
                <button
                  key={role}
                  ref={(el) => {
                    tabRefs.current[role] = el
                  }}
                  id={`role-tab-${role.toLowerCase()}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`role-panel-${role.toLowerCase()}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setSelectedRole(role)}
                  onKeyDown={(e) => handleKeyDown(e, role)}
                  className={`min-h-[44px] px-5 py-2.5 font-label-caps text-[11px] uppercase tracking-wider rounded-[1px] border transition-all ${
                    active
                      ? 'border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold shadow-[0_0_12px_rgba(200,245,66,0.3)]'
                      : 'border-outline-border bg-[#0c0f12] text-text-muted hover:border-outline-variant hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {role === 'MAKER' && <span>01</span>}
                    {role === 'COUNTERPARTY' && <span>02</span>}
                    {role === 'ARBITER' && <span>03</span>}
                    <span>{role}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Active Perspective Content Panel */}
        <div
          id={`role-panel-${selectedRole.toLowerCase()}`}
          role="tabpanel"
          aria-labelledby={`role-tab-${selectedRole.toLowerCase()}`}
          className="pact-role-pane mt-6 animate-enter"
        >
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left: Role Profile & Objective */}
            <div className="lg:col-span-5 space-y-5 rounded-[2px] border border-outline-hairline bg-[#0c0f12] p-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-code-hash text-[10px] text-text-dim uppercase tracking-wider">
                    Perspective
                  </span>
                  <span className="rounded-[1px] border border-primary-fixed/30 bg-primary-fixed/10 px-1.5 py-0.5 font-label-caps text-[9px] text-primary-fixed font-bold">
                    {current.badge}
                  </span>
                </div>
                <h3 className="mt-2 font-headline-mono text-[20px] font-bold text-white">
                  {current.title}
                </h3>
                <p className="mt-1 font-body-sans text-[13px] text-text-muted">
                  {current.subtitle}
                </p>
              </div>

              <div className="border-t border-outline-hairline pt-4">
                <p className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                  Primary Objective
                </p>
                <p className="mt-1.5 font-body-sans text-[13px] leading-relaxed text-white/90">
                  {current.objective}
                </p>
              </div>

              <div className="border-t border-outline-hairline pt-4 font-code-hash text-[11px]">
                <p className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                  Standard Flow
                </p>
                <p className="mt-1.5 text-primary-fixed font-medium">
                  {current.keyAction}
                </p>
              </div>
            </div>

            {/* Right: Responsibilities & Safety Safeguards */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6 rounded-[2px] border border-outline-hairline bg-[#0c0f12] p-6">
              <div>
                <p className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                  Protocol Responsibilities & Rules
                </p>
                <ul className="mt-4 space-y-3 font-body-sans text-[13px] text-text-muted">
                  {current.responsibilities.map((resp, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-[1px] border border-primary-fixed/40 bg-primary-fixed/10 font-code-hash text-[10px] text-primary-fixed font-bold"
                      >
                        {i + 1}
                      </span>
                      <span className="leading-5">{resp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Safeguard highlight box */}
              <div className="border border-outline-border bg-[#07080a] p-4 rounded-[1px]">
                <div className="flex items-center gap-2 text-primary-fixed font-label-caps text-[10px] uppercase tracking-wider font-bold">
                  <span>🛡</span>
                  <span>Safety & Enforcement Guarantee</span>
                </div>
                <p className="mt-1.5 font-code-hash text-[11px] text-text-muted leading-relaxed">
                  {current.safetyFeature}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
