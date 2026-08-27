'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useNotifications } from '../hooks/useNotifications'
import { type NotificationCategory, type PactNotification } from '../lib/notifications'
import RoleBadge from './RoleBadge'

export default function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    urgentNotifications,
    claimNotifications,
    preferences,
    updatePreferences,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications()

  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'urgent' | 'claims' | 'settings'>('all')
  const panelRef = useRef<HTMLDivElement>(null)

  // Handle outside click & escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const displayedList = activeTab === 'urgent'
    ? urgentNotifications
    : activeTab === 'claims'
    ? claimNotifications
    : notifications

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        id="notification-center-trigger"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Notifications (${unreadCount} unread)`}
        className={`relative inline-flex min-h-[38px] sm:min-h-[42px] items-center justify-center border px-2.5 sm:px-3 transition-colors ${
          isOpen
            ? 'border-primary-fixed bg-primary-fixed/[0.08] text-primary-fixed'
            : unreadCount > 0
            ? 'border-primary-fixed/60 bg-[#0c0f12] text-white hover:border-primary-fixed'
            : 'border-outline-border bg-[#0c0f12] text-text-muted hover:border-outline-variant hover:text-white'
        }`}
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          {unreadCount > 0 ? 'notifications_active' : 'notifications'}
        </span>

        {/* Live Unread Badge */}
        {unreadCount > 0 && (
          <span 
            aria-label={`${unreadCount} unread alerts`}
            className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-fixed px-1 font-display-mono text-[9px] font-bold text-black ring-2 ring-[#07080a]"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Notification Drawer / Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Center"
          className="absolute right-0 mt-2 w-[340px] sm:w-[420px] max-w-[calc(100vw-24px)] border border-outline-border bg-[#0c0f12] shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 animate-enter"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-outline-hairline flex items-center justify-between bg-[#07080a]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary-fixed" aria-hidden="true">
                notifications
              </span>
              <span className="font-headline-mono text-[12px] font-bold uppercase tracking-wider text-white">
                Live Alerts
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 bg-primary-fixed/20 border border-primary-fixed/40 text-primary-fixed font-code-hash text-[10px]">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[10px] font-code-hash text-text-muted hover:text-white transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close notifications"
                className="text-text-dim hover:text-white p-0.5"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-outline-hairline bg-[#07080a] text-[11px] font-label-caps uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-2 text-center transition-colors ${
                activeTab === 'all'
                  ? 'border-b-2 border-primary-fixed font-bold text-white bg-[#0c0f12]'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('urgent')}
              className={`flex-1 py-2 text-center transition-colors ${
                activeTab === 'urgent'
                  ? 'border-b-2 border-rose-400 font-bold text-rose-400 bg-[#0c0f12]'
                  : 'text-text-muted hover:text-rose-300'
              }`}
            >
              🚨 Urgent ({urgentNotifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('claims')}
              className={`flex-1 py-2 text-center transition-colors ${
                activeTab === 'claims'
                  ? 'border-b-2 border-emerald-400 font-bold text-emerald-400 bg-[#0c0f12]'
                  : 'text-text-muted hover:text-emerald-300'
              }`}
            >
              💰 Credits ({claimNotifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-2 px-3 text-center transition-colors ${
                activeTab === 'settings'
                  ? 'border-b-2 border-primary-fixed font-bold text-primary-fixed bg-[#0c0f12]'
                  : 'text-text-muted hover:text-white'
              }`}
              title="Notification Preferences"
            >
              ⚙️
            </button>
          </div>

          {/* Body Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-outline-hairline/60">
            {activeTab === 'settings' ? (
              <div className="p-4 space-y-4 text-[11px] font-body-sans">
                <div>
                  <h4 className="font-headline-mono text-[11px] font-bold uppercase tracking-wider text-white mb-1">
                    Notification Categories
                  </h4>
                  <p className="text-[10px] text-text-dim">Choose which on-chain state updates and alerts to track.</p>
                </div>

                <div className="space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-text-muted">⏳ Binding Deadline Reminders</span>
                    <input
                      type="checkbox"
                      checked={preferences.enabledCategories.deadlines}
                      onChange={e =>
                        updatePreferences({
                          ...preferences,
                          enabledCategories: { ...preferences.enabledCategories, deadlines: e.target.checked },
                        })
                      }
                      className="accent-[#c8f542] h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-text-muted">📦 Proof Submissions & Review</span>
                    <input
                      type="checkbox"
                      checked={preferences.enabledCategories.proofs}
                      onChange={e =>
                        updatePreferences({
                          ...preferences,
                          enabledCategories: { ...preferences.enabledCategories, proofs: e.target.checked },
                        })
                      }
                      className="accent-[#c8f542] h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-text-muted">🚨 Dispute Challenges & Responses</span>
                    <input
                      type="checkbox"
                      checked={preferences.enabledCategories.disputes}
                      onChange={e =>
                        updatePreferences({
                          ...preferences,
                          enabledCategories: { ...preferences.enabledCategories, disputes: e.target.checked },
                        })
                      }
                      className="accent-[#c8f542] h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-text-muted">💰 Claimable Pull Credits</span>
                    <input
                      type="checkbox"
                      checked={preferences.enabledCategories.withdrawals}
                      onChange={e =>
                        updatePreferences({
                          ...preferences,
                          enabledCategories: { ...preferences.enabledCategories, withdrawals: e.target.checked },
                        })
                      }
                      className="accent-[#c8f542] h-4 w-4"
                    />
                  </label>
                </div>

                {/* Urgency Horizon */}
                <div className="pt-3 border-t border-outline-hairline/60 space-y-1.5">
                  <label className="block text-text-muted">Urgency Horizon Threshold</label>
                  <select
                    value={preferences.urgencyThresholdHours}
                    onChange={e =>
                      updatePreferences({
                        ...preferences,
                        urgencyThresholdHours: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#07080a] border border-outline-border p-2 text-white font-code-hash text-[11px]"
                  >
                    <option value={12}>12 Hours before cutoff</option>
                    <option value={24}>24 Hours before cutoff (Default)</option>
                    <option value={48}>48 Hours before cutoff</option>
                    <option value={72}>72 Hours before cutoff</option>
                  </select>
                </div>

                {/* Privacy Badge */}
                <div className="p-2.5 bg-[#07080a] border border-outline-hairline text-[10px] text-text-dim space-y-1">
                  <span className="text-emerald-400 font-bold block">🔒 Zero-Tracking Privacy Invariant</span>
                  <p>All alerts are evaluated locally or via verified RPC. No private terms or wallet telemetry are sent to third parties.</p>
                </div>

                {/* Clear / Unsubscribe Button */}
                <button
                  type="button"
                  onClick={clearAll}
                  className="w-full py-1.5 border border-outline-border bg-[#07080a] text-text-muted hover:text-white font-label-caps uppercase text-[10px]"
                >
                  Clear All Read Notifications
                </button>
              </div>
            ) : displayedList.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <span className="material-symbols-outlined text-[28px] text-text-dim" aria-hidden="true">
                  done_all
                </span>
                <p className="text-[12px] font-code-hash text-text-muted">All caught up</p>
                <p className="text-[10px] text-text-dim">No active alerts or urgent deadlines requiring your action.</p>
              </div>
            ) : (
              displayedList.map(item => (
                <div
                  key={item.id}
                  className={`p-3.5 space-y-2 transition-colors ${
                    item.read ? 'bg-[#0c0f12] opacity-75' : 'bg-[#07080a] hover:bg-[#0c0f12]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px]">
                        {item.priority === 'critical' ? '🚨' : item.priority === 'urgent' ? '⚠️' : item.priority === 'success' ? '💰' : 'ℹ️'}
                      </span>
                      <span className="font-headline-mono text-[11px] font-bold text-white">
                        {item.title}
                      </span>
                    </div>

                    {!item.read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(item.id)}
                        className="text-[9px] font-code-hash text-text-dim hover:text-primary-fixed p-0.5"
                        title="Mark as read"
                      >
                        ✓ Read
                      </button>
                    )}
                  </div>

                  <p className="font-body-sans text-[11px] text-text-muted leading-relaxed">
                    {item.message}
                  </p>

                  <div className="flex items-center justify-between pt-1 text-[10px] font-code-hash">
                    {item.metadata?.role && (
                      <RoleBadge role={item.metadata.role} size="xs" isCurrentUser={true} />
                    )}

                    <Link
                      href={item.deepLink}
                      onClick={() => {
                        markAsRead(item.id)
                        setIsOpen(false)
                      }}
                      className="pact-button-primary py-1 px-3 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1"
                    >
                      <span>{item.actionLabel || 'View Action'}</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-[#07080a] border-t border-outline-hairline text-center">
            <Link
              href="/me"
              onClick={() => setIsOpen(false)}
              className="text-[10px] font-label-caps uppercase text-text-muted hover:text-primary-fixed transition-colors"
            >
              View Full Portfolio & Action Center →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
