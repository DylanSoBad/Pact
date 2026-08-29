import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdvancedDetails from '../components/AdvancedDetails'

describe('AdvancedDetails Progressive Disclosure Component', () => {
  it('is collapsed by default and displays expand label', () => {
    render(
      <AdvancedDetails
        contractAddress="0x1111111111111111111111111111111111111111"
        termsHash="0xabcdef"
      />
    )
    const button = screen.getByRole('button', { name: /Advanced \/ On-Chain Details/i })
    expect(button).toBeInTheDocument()
    expect(screen.queryByText(/PACT Core Contract/i)).not.toBeInTheDocument()
  })

  it('expands on click to reveal on-chain contract and cryptographic hashes', () => {
    render(
      <AdvancedDetails
        contractAddress="0x1111111111111111111111111111111111111111"
        termsHash="0xabcdef123456"
        defaultOpen={true}
      />
    )
    expect(screen.getByText(/PACT Core Contract:/i)).toBeInTheDocument()
    expect(screen.getByText(/Committed Terms Hash \(Keccak256\):/i)).toBeInTheDocument()
    expect(screen.getByText('0xabcdef123456')).toBeInTheDocument()
  })
})
