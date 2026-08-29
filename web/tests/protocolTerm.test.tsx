import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProtocolTerm from '../components/ProtocolTerm'

describe('ProtocolTerm Component', () => {
  it('renders term label with accessible tooltip button', () => {
    render(<ProtocolTerm term="MAKER">Maker (Party A)</ProtocolTerm>)
    const button = screen.getByRole('button', { name: /Definition of Maker/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent('Maker (Party A)')
  })

  it('opens and displays term definitions on click', () => {
    render(<ProtocolTerm term="DISPUTE_BOND" />)
    const button = screen.getByRole('button')
    fireEvent.click(button)

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('5% of notional valuation')
  })

  it('closes popover on escape key', () => {
    render(<ProtocolTerm term="TERMS_HASH" />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
