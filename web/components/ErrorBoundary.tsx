'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { captureClientError } from '../lib/telemetry'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo)
    captureClientError(error, { source: 'react-error-boundary' })
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div 
          role="alert" 
          aria-live="assertive"
          className="min-h-[400px] w-full flex flex-col items-center justify-center p-6 bg-surface-container-lowest border border-status-error/40 rounded-DEFAULT text-on-surface font-code-hash shadow-2xl my-6"
        >
          <div className="w-full max-w-[28rem] p-6 bg-[#0e0a0d] border border-status-error/60 rounded-DEFAULT relative overflow-hidden">
            {/* Top error badge */}
            <div className="flex items-center gap-2 text-status-error mb-4 border-b border-status-error/30 pb-3">
              <span className="material-symbols-outlined text-[22px]">error</span>
              <span className="font-headline-mono text-[14px] uppercase tracking-wider">SYSTEM FAULT // EXCEPTION</span>
            </div>

            <p className="text-[13px] text-text-muted mb-4 leading-relaxed">
              An unexpected runtime error occurred while rendering this interface component.
            </p>

            {this.state.error && (
              <div className="bg-black/60 border border-outline-hairline p-3 rounded text-[11px] text-rose-300 font-mono overflow-x-auto mb-5 max-h-32">
                <code>{this.state.error.toString()}</code>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 border border-primary-fixed bg-primary-fixed/10 text-primary-fixed text-[11px] font-label-caps uppercase hover:bg-primary-fixed hover:text-on-primary-fixed transition-colors rounded-DEFAULT focus-visible:ring-2 focus-visible:ring-primary-fixed"
              >
                &gt; RETRY OPERATION
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 border border-outline-hairline bg-surface-container text-text-muted text-[11px] font-label-caps uppercase hover:border-text-dim hover:text-on-surface transition-colors rounded-DEFAULT focus-visible:ring-2 focus-visible:ring-primary-fixed"
              >
                RELOAD APP
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
