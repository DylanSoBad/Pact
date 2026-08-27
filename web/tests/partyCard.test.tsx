import { describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import PartyCard from '../components/PartyCard'

describe('PartyCard Component', () => {
  const MAKER_ADDR = '0x1111111111111111111111111111111111111111'
  const TAKER_ADDR = '0x2222222222222222222222222222222222222222'

  it('renders Maker party card with YOU (MAKER) when current user is maker', () => {
    render(
      <PartyCard
        role="MAKER"
        address={MAKER_ADDR}
        isCurrentUser={true}
        collateralAmount={1000000000n}
        tokenAddress="0x0000000000000000000000000000000000000001"
      />
    )

    expect(screen.getByText('Maker (Deal Creator)')).toBeDefined()
    expect(screen.getByText('YOU (MAKER)')).toBeDefined()
    expect(screen.getByText(/Deposited collateral in escrow/i)).toBeDefined()
  })

  it('renders Counterparty party card with clear obligations', () => {
    render(
      <PartyCard
        role="TAKER"
        address={TAKER_ADDR}
        isCurrentUser={false}
        collateralAmount={500000000n}
      />
    )

    expect(screen.getByText('Counterparty (Taker)')).toBeDefined()
    expect(screen.getByText('COUNTERPARTY')).toBeDefined()
    expect(screen.getByText(/Designated fulfillment party/i)).toBeDefined()
  })
})
