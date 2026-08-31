import { describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import SettlementRail, { LIFECYCLE_STAGES } from '../components/SettlementRail'

describe('SettlementRail Component', () => {
  it('renders section landmark and 5 lifecycle stages', () => {
    render(<SettlementRail />)

    const section = screen.getByRole('region', { name: /settlement lifecycle rail/i })
    expect(section).toBeDefined()

    expect(screen.getByText('From written intent to irreversible settlement.')).toBeDefined()

    expect(LIFECYCLE_STAGES.length).toBe(5)

    // Check all stage titles
    expect(screen.getByRole('heading', { level: 3, name: 'TERMS' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: 'LOCK' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: 'PERFORM' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: 'REVIEW' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: 'SETTLE' })).toBeDefined()
  })

  it('renders roles and descriptions for all stages', () => {
    render(<SettlementRail />)

    expect(
      screen.getByText('Both parties commit to exact written terms anchored by a cryptographic digest.')
    ).toBeDefined()
    expect(
      screen.getByText('Maker and counterparty authorize exact collateral into the PACT vault.')
    ).toBeDefined()
    expect(
      screen.getByText('The designated party performs the agreed off-chain obligation.')
    ).toBeDefined()
    expect(
      screen.getByText('Proof can be accepted, challenged, or escalated through the dispute window.')
    ).toBeDefined()
    expect(
      screen.getByText('Collateral and payment are released, refunded, or awarded according to the final state.')
    ).toBeDefined()
  })

  it('contains technical code assertions for smart contract validation', () => {
    render(<SettlementRail />)

    const codeSnippets = screen.getAllByText(/bytes32 termsHash = sha256\(plaintextTerms\);/i)
    expect(codeSnippets.length).toBeGreaterThanOrEqual(1)
  })
})
