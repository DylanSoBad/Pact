import { describe, expect, it, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import RolePerspectiveModal from '../components/RolePerspectiveModal'

describe('RolePerspectiveModal Component', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('renders modal dialog when open and closes on X button click', () => {
    render(<RolePerspectiveModal isOpen={true} />)

    const dialog = screen.getByRole('dialog', { name: /protocol role perspective guide/i })
    expect(dialog).toBeDefined()

    const closeButton = screen.getByRole('button', { name: /close vantage point guide/i })
    fireEvent.click(closeButton)

    expect(sessionStorage.getItem('pact-vantage-guide-seen')).toBe('true')
  })

  it('closes on Continue to PACT button click', () => {
    render(<RolePerspectiveModal isOpen={true} />)

    const continueBtn = screen.getByRole('button', { name: /continue to pact/i })
    fireEvent.click(continueBtn)

    expect(sessionStorage.getItem('pact-vantage-guide-seen')).toBe('true')
  })

  it('switches role tabs inside modal', () => {
    render(<RolePerspectiveModal isOpen={true} />)

    const counterpartyTab = screen.getByRole('tab', { name: /counterparty/i })
    fireEvent.click(counterpartyTab)

    expect(counterpartyTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Counterparty / Performer')).toBeDefined()
  })

  it('closes on Escape key press', () => {
    render(<RolePerspectiveModal isOpen={true} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(sessionStorage.getItem('pact-vantage-guide-seen')).toBe('true')
  })
})
