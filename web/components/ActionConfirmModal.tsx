'use client'

import { formatAmount, tokenSymbol, truncateAddress } from '../lib/format'
import type { PactAction } from '../lib/actionMatrix'

export interface ActionConfirmModalProps {
  isOpen: boolean
  pactId: number
  action: PactAction | null
  isSubmitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ActionConfirmModal({
  isOpen,
  pactId,
  action,
  isSubmitting,
  onConfirm,
  onCancel,
}: ActionConfirmModalProps) {
  if (!isOpen || !action) return null

  const isDangerous = action.isDangerous
  const severityBadge =
    action.severity === 'danger'
      ? 'border-rose-500/40 bg-rose-950/30 text-rose-400'
      : action.severity === 'warning'
      ? 'border-amber-500/40 bg-amber-950/30 text-amber-400'
      : 'border-primary-fixed/40 bg-primary-fixed/10 text-primary-fixed'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-enter"
    >
      <div className="w-full max-w-lg border border-outline-border bg-[#0c0f12] p-6 space-y-5 shadow-2xl font-code-hash">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-outline-hairline">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-label-caps uppercase text-text-muted">
                Pact #{String(pactId).padStart(4, '0')} · Pre-Flight Action Review
              </span>
              <span className={`px-2 py-0.5 text-[9px] font-label-caps uppercase font-bold border ${severityBadge}`}>
                {action.role}
              </span>
            </div>
            <h2 id="action-confirm-title" className="font-headline-mono text-[16px] font-bold text-white">
              {action.label}
            </h2>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="text-text-dim hover:text-white p-1 text-sm transition-colors"
            aria-label="Close review modal"
          >
            ✕
          </button>
        </div>

        {/* Action Details & On-Chain Method */}
        <div className="p-3 border border-outline-hairline bg-[#07080a] space-y-2 text-[12px]">
          <div className="flex items-center justify-between text-text-dim">
            <span>Target Protocol Function:</span>
            <span className="text-primary-fixed font-bold">{action.functionName}</span>
          </div>
          <div className="text-text-muted leading-relaxed font-body-sans">
            {action.description}
          </div>
        </div>

        {/* Financial Flow Breakdown */}
        <div className="border border-outline-hairline bg-[#07080a] p-3.5 space-y-2.5 text-[12px]">
          <span className="font-label-caps text-[10px] uppercase text-text-muted block border-b border-outline-hairline/40 pb-1">
            Capital Movement & Custody Impact
          </span>

          {action.financialSummary.amount > 0n && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">Escrow Collateral Flow:</span>
              <span className="text-white font-bold tabular-nums">
                {formatAmount(action.financialSummary.amount)} {tokenSymbol(action.financialSummary.token)}
              </span>
            </div>
          )}

          {action.financialSummary.bondAmount && action.financialSummary.bondAmount > 0n && (
            <div className="flex items-center justify-between">
              <span className="text-amber-400">Dispute Bond Required (5%):</span>
              <span className="text-amber-400 font-bold tabular-nums">
                {formatAmount(action.financialSummary.bondAmount)} USDC
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-text-dim">Recipient / Custody:</span>
            <span className="text-white font-medium">
              {truncateAddress(action.financialSummary.recipient)} ({action.financialSummary.recipientRole})
            </span>
          </div>
        </div>

        {/* Warning Callout for Destructive / High Risk Actions */}
        {action.warningMessage && (
          <div className="p-3 border border-amber-500/40 bg-amber-950/20 text-amber-300 text-[11px] leading-relaxed flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[16px] text-amber-400 shrink-0 mt-0.5">
              warning
            </span>
            <p className="font-body-sans">{action.warningMessage}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="pact-button-secondary min-h-[44px] text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
          >
            Cancel / Back
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className={`${
              isDangerous ? 'bg-rose-500 text-black hover:bg-rose-400' : 'pact-button-primary'
            } min-h-[44px] text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40`}
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Confirming…</span>
              </>
            ) : (
              <span>Confirm & Sign in Wallet</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
