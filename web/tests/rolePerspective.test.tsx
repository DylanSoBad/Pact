import { describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import RolePerspective from '../components/RolePerspective'

describe('RolePerspective Component', () => {
  it('renders tablist and defaults to MAKER perspective', () => {
    render(<RolePerspective />)

    const tablist = screen.getByRole('tablist', { name: /protocol participant roles/i })
    expect(tablist).toBeDefined()

    const makerTab = screen.getByRole('tab', { name: /maker/i })
    expect(makerTab.getAttribute('aria-selected')).toBe('true')

    expect(screen.getByText('Maker / Escrow Depositor')).toBeDefined()
    expect(screen.getByText('CAPITAL DEPOSITOR')).toBeDefined()
  })

  it('switches perspective content when clicking COUNTERPARTY and ARBITER tabs', () => {
    render(<RolePerspective />)

    const counterpartyTab = screen.getByRole('tab', { name: /counterparty/i })
    fireEvent.click(counterpartyTab)

    expect(counterpartyTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Counterparty / Performer')).toBeDefined()
    expect(screen.getByText('OBLIGATION PERFORMER')).toBeDefined()
    expect(
      screen.getByText(/Autonomous payout release if Maker goes unresponsive after proof submission/i)
    ).toBeDefined()

    const arbiterTab = screen.getByRole('tab', { name: /arbiter/i })
    fireEvent.click(arbiterTab)

    expect(arbiterTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Designated Arbiter')).toBeDefined()
    expect(screen.getByText('DISPUTE RESOLVER')).toBeDefined()
  })

  it('navigates tabs using keyboard arrow keys', () => {
    render(<RolePerspective />)

    const makerTab = screen.getByRole('tab', { name: /maker/i })
    makerTab.focus()

    fireEvent.keyDown(makerTab, { key: 'ArrowRight' })
    const counterpartyTab = screen.getByRole('tab', { name: /counterparty/i })
    expect(counterpartyTab.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(counterpartyTab, { key: 'ArrowRight' })
    const arbiterTab = screen.getByRole('tab', { name: /arbiter/i })
    expect(arbiterTab.getAttribute('aria-selected')).toBe('true')
  })

  it('displays educational disclaimer stating it does not alter wallet role', () => {
    render(<RolePerspective />)

    expect(
      screen.getByText(/Educational perspective switcher · Does not alter wallet role/i)
    ).toBeDefined()
  })
})
