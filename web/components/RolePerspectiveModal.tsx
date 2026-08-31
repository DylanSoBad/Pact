'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ROLE_DETAILS, ProtocolRole } from './RolePerspective'
import { X, ArrowRight, Shield } from 'lucide-react'

export default function RolePerspectiveModal({
  isOpen,
  onClose,
}: {
  isOpen?: boolean
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<ProtocolRole>('MAKER')
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const tabRefs = useRef<{ [key in ProtocolRole]?: HTMLButtonElement | null }>({})

  const roles: ProtocolRole[] = ['MAKER', 'COUNTERPARTY', 'ARBITER']
  const current = ROLE_DETAILS[selectedRole]

  useEffect(() => {
    if (isOpen !== undefined) {
      setOpen(isOpen)
      return
    }
    // Auto-open on first visit in session
    if (sessionStorage.getItem('pact-vantage-guide-seen') !== 'true') {
      previousActiveElement.current = document.activeElement as HTMLElement | null
      setOpen(true)
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    sessionStorage.setItem('pact-vantage-guide-seen', 'true')
    setOpen(false)
    onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousActiveElement.current?.focus?.()
    }
  }, [open, handleClose])

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentRole: ProtocolRole) => {
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

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Protocol Role Perspective Guide"
      className="pact-intro-overlay fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="relative mx-auto w-full max-w-[980px] rounded-[2px] border border-primary-fixed/60 bg-[#0c0f12] shadow-[0_12px_48px_rgba(0,0,0,0.9)] animate-enter">
        {/* Modal Top Navigation Bar */}
        <div className="flex items-center justify-between border-b border-outline-hairline px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-[1px] bg-primary-fixed" />
            <p className="font-label-caps text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fixed">
              Protocol Role Matrix
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            aria-label="Close vantage point guide"
            className="flex h-9 w-9 items-center justify-center rounded-[1px] border border-outline-border bg-[#12161b] text-text-muted transition-colors hover:border-primary-fixed hover:text-primary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fixed"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Main Body */}
        <div className="max-h-[calc(85vh-8rem)] overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
          {/* Header */}
          <div>
            <h2
              id="vantage-modal-title"
              className="font-editorial text-[24px] font-normal leading-tight tracking-[-0.025em] text-[#f4f5f7] sm:text-[32px]"
            >
              How PACT works from your vantage point.
            </h2>
            <p className="mt-1.5 font-body-sans text-[13px] text-text-muted">
              Understand the rights, collateral commitments, and execution safeguards for each participant.
            </p>
          </div>

          {/* Segmented Role Tabs */}
          <div className="mt-6">
            <div
              role="tablist"
              aria-label="Protocol participant roles popup"
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
                    id={`modal-role-tab-${role.toLowerCase()}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`modal-role-panel-${role.toLowerCase()}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setSelectedRole(role)}
                    onKeyDown={(e) => handleTabKeyDown(e, role)}
                    className={`min-h-[42px] px-4 py-2 font-label-caps text-[11px] uppercase tracking-wider rounded-[1px] border transition-all ${
                      active
                        ? 'border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold shadow-[0_0_12px_rgba(200,245,66,0.3)]'
                        : 'border-outline-border bg-[#07080a] text-text-muted hover:border-outline-variant hover:text-white'
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

          {/* Tab Content Panel */}
          <div
            id={`modal-role-panel-${selectedRole.toLowerCase()}`}
            role="tabpanel"
            aria-labelledby={`modal-role-tab-${selectedRole.toLowerCase()}`}
            className="pact-role-pane mt-5"
          >
            <div className="grid gap-5 md:grid-cols-12">
              {/* Left Box: Objective & Standard Flow */}
              <div className="space-y-4 rounded-[2px] border border-outline-hairline bg-[#07080a] p-5 md:col-span-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-code-hash text-[10px] text-text-dim uppercase tracking-wider">
                      Perspective
                    </span>
                    <span className="rounded-[1px] border border-primary-fixed/30 bg-primary-fixed/10 px-1.5 py-0.5 font-label-caps text-[9px] text-primary-fixed font-bold">
                      {current.badge}
                    </span>
                  </div>
                  <h3 className="mt-2 font-headline-mono text-[18px] font-bold text-white">
                    {current.title}
                  </h3>
                  <p className="mt-1 font-body-sans text-[12px] text-text-muted">
                    {current.subtitle}
                  </p>
                </div>

                <div className="border-t border-outline-hairline pt-3">
                  <p className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                    Primary Objective
                  </p>
                  <p className="mt-1 font-body-sans text-[12px] leading-relaxed text-white/90">
                    {current.objective}
                  </p>
                </div>

                <div className="border-t border-outline-hairline pt-3 font-code-hash text-[11px]">
                  <p className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                    Standard Flow
                  </p>
                  <p className="mt-1 text-primary-fixed text-[11px] font-medium leading-relaxed">
                    {current.keyAction}
                  </p>
                </div>
              </div>

              {/* Right Box: Responsibilities & Guarantees */}
              <div className="flex flex-col justify-between space-y-4 rounded-[2px] border border-outline-hairline bg-[#07080a] p-5 md:col-span-7">
                <div>
                  <p className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                    Protocol Responsibilities & Rules
                  </p>
                  <ul className="mt-3 space-y-2.5 font-body-sans text-[12px] text-text-muted">
                    {current.responsibilities.map((resp, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[1px] border border-primary-fixed/40 bg-primary-fixed/10 font-code-hash text-[9px] text-primary-fixed font-bold"
                        >
                          {i + 1}
                        </span>
                        <span className="leading-5">{resp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border border-outline-border bg-[#0c0f12] p-3.5 rounded-[1px]">
                  <div className="flex items-center gap-1.5 text-primary-fixed font-label-caps text-[10px] uppercase tracking-wider font-bold">
                    <Shield aria-hidden="true" className="h-3.5 w-3.5" />
                    <span>Safety & Enforcement Guarantee</span>
                  </div>
                  <p className="mt-1 font-code-hash text-[11px] text-text-muted leading-relaxed">
                    {current.safetyFeature}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-outline-hairline bg-[#07080a] px-5 py-4 sm:px-8">
          <p className="font-code-hash text-[10px] text-text-dim">
            <span className="text-primary-fixed">ℹ</span> Educational perspective switcher · Press <kbd className="rounded border border-outline-border bg-[#12161b] px-1 py-0.5 text-white">ESC</kbd> or click <kbd className="rounded border border-outline-border bg-[#12161b] px-1 py-0.5 text-white">✕</kbd> to close
          </p>

          <button
            type="button"
            onClick={handleClose}
            className="pact-button-primary w-full sm:w-auto min-h-[44px] px-6 gap-2"
          >
            <span>Continue to PACT</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
