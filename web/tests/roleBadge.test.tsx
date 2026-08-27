import { describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import RoleBadge from '../components/RoleBadge'

describe('RoleBadge Accessibility & Rendering', () => {
  it('renders MAKER role correctly for third party observer', () => {
    render(<RoleBadge role="MAKER" isCurrentUser={false} />)
    const badge = screen.getByRole('status')
    expect(badge).toBeDefined()
    expect(badge.textContent).toBe('MAKER')
    expect(badge.getAttribute('aria-label')).toBe('Role: Maker (Deal Creator and Collateral Depositor)')
  })

  it('renders YOU (MAKER) when isCurrentUser is true with distinct highlight', () => {
    render(<RoleBadge role="MAKER" isCurrentUser={true} />)
    const badge = screen.getByRole('status')
    expect(badge.textContent).toContain('YOU (MAKER)')
    expect(badge.getAttribute('aria-label')).toBe('Your role: Maker (Deal Creator and Collateral Depositor)')
  })

  it('renders TAKER counterparty role and YOU (COUNTERPARTY) label', () => {
    render(<RoleBadge role="TAKER" isCurrentUser={true} />)
    const badge = screen.getByRole('status')
    expect(badge.textContent).toContain('YOU (COUNTERPARTY)')
    expect(badge.getAttribute('aria-label')).toBe('Your role: Counterparty (Designated Fulfiller)')
  })

  it('renders ARBITER role and YOU (ARBITER) label', () => {
    render(<RoleBadge role="ARBITER" isCurrentUser={true} />)
    const badge = screen.getByRole('status')
    expect(badge.textContent).toContain('YOU (ARBITER)')
    expect(badge.getAttribute('aria-label')).toBe('Your role: Designated Arbiter (Neutral Dispute Mediator)')
  })

  it('renders OBSERVER role correctly', () => {
    render(<RoleBadge role="OBSERVER" isCurrentUser={false} />)
    const badge = screen.getByRole('status')
    expect(badge.textContent).toBe('OBSERVER')
    expect(badge.getAttribute('aria-label')).toBe('Role: Observer (Non-participant)')
  })
})
