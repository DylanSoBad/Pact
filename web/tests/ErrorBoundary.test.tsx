import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary'
import React from 'react'

function ProblemChild(): React.JSX.Element {
  throw new Error('Test crash in contract rendering')
}

function GoodChild(): React.JSX.Element {
  return <div>Contract System Operational</div>
}

describe('ErrorBoundary Component', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('Contract System Operational')).toBeInTheDocument()
  })

  it('renders error fallback UI when a component throws', () => {
    // Suppress console.error in test output for intentional crash
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    )

    expect(screen.getByText(/SYSTEM FAULT \/\/ EXCEPTION/i)).toBeInTheDocument()
    expect(screen.getByText(/Test crash in contract rendering/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /> RETRY OPERATION/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /RELOAD APP/i })).toBeInTheDocument()

    spy.mockRestore()
  })
})
