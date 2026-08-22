'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function OnboardingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="pact-onboarding-title" onMouseDown={event => event.stopPropagation()} className="w-full max-w-[36rem] border border-primary-fixed/50 bg-surface-container-lowest p-5 shadow-2xl md:rounded-DEFAULT md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-label-caps text-[11px] uppercase text-primary-fixed">First time here?</p>
            <h2 id="pact-onboarding-title" className="mt-1 font-display-mono text-xl text-on-surface uppercase">How a pact settles</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close onboarding guide" className="grid h-11 w-11 place-items-center border border-outline-border text-text-muted hover:border-primary-fixed hover:text-primary-fixed">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>
        <ol className="mt-5 grid gap-3 font-code-hash text-[12px] text-text-muted md:grid-cols-3">
          <li><span className="text-primary-fixed">01</span> Create a pact — choose Delivery, FX, or Job.</li>
          <li><span className="text-primary-fixed">02</span> Lock collateral — both parties deposit USDC.</li>
          <li><span className="text-primary-fixed">03</span> Settle — fulfill conditions or claim timeout.</li>
        </ol>
      </section>
    </div>,
    document.body,
  )
}
