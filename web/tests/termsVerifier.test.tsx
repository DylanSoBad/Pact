import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TermsVerifier from '../components/TermsVerifier'
import { CanonicalPactTerms, hashPactTerms } from '../lib/terms'

const mockPact: CanonicalPactTerms = {
  chainId: 5_042_002n,
  pactAddress: '0x1111111111111111111111111111111111111111',
  maker: '0x2222222222222222222222222222222222222222',
  taker: '0x3333333333333333333333333333333333333333',
  arbiter: '0x4444444444444444444444444444444444444444',
  tokenMaker: '0x3600000000000000000000000000000000000000',
  tokenTaker: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  amountMaker: 10_000_000n,
  amountTaker: 0n,
  notionalUSDC: 10_000_000n,
  arbiterFeeCap: 500_000n,
  offerExpiry: 1_800_000_000n,
  performanceDeadline: 1_800_100_000n,
  disputeDeadline: 1_800_200_000n,
  kind: 0,
  blurSize: false,
}

const validPlaintext = 'Official smart contract audit services delivered on-chain.'
const onChainHash = hashPactTerms(mockPact, validPlaintext)

describe('TermsVerifier Component', () => {
  it('renders human-readable agreement summary parameters', () => {
    render(
      <TermsVerifier
        canonicalTerms={mockPact}
        onChainTermsHash={onChainHash}
        plaintextTerms=""
        onPlaintextChange={() => {}}
        isTaker={true}
      />
    )

    expect(screen.getByText(/1\. Human-Readable Agreement Breakdown/i)).toBeInTheDocument()
    expect(screen.getByText(/Delivery Escrow/i)).toBeInTheDocument()
    expect(screen.getByText(/Awaiting Plaintext Verification/i)).toBeInTheDocument()
  })

  it('displays 100% cryptographic match indicator and guarantee when plaintext matches', () => {
    render(
      <TermsVerifier
        canonicalTerms={mockPact}
        onChainTermsHash={onChainHash}
        plaintextTerms={validPlaintext}
        onPlaintextChange={() => {}}
        isTaker={true}
      />
    )

    expect(screen.getByText(/✓ 100% Cryptographic Match/i)).toBeInTheDocument()
    expect(screen.getByText(/Tamper-Proof Guarantee:/i)).toBeInTheDocument()
  })

  it('displays critical mismatch warning and guidance when text does not hash to on-chain commitment', () => {
    render(
      <TermsVerifier
        canonicalTerms={mockPact}
        onChainTermsHash={onChainHash}
        plaintextTerms="Tampered text that does not match."
        onPlaintextChange={() => {}}
        isTaker={true}
      />
    )

    expect(screen.getByText(/❌ Terms Mismatch Detected/i)).toBeInTheDocument()
    expect(screen.getByText(/CRITICAL WARNING: TERMS HASH MISMATCH/i)).toBeInTheDocument()
    expect(screen.getByText(/Acceptance is automatically/i)).toBeInTheDocument()
  })

  it('toggles advanced cryptographic fingerprint accordion with full hash details', () => {
    render(
      <TermsVerifier
        canonicalTerms={mockPact}
        onChainTermsHash={onChainHash}
        plaintextTerms={validPlaintext}
        onPlaintextChange={() => {}}
        isTaker={true}
      />
    )

    const toggleButton = screen.getByRole('button', { name: /Advanced Cryptographic Fingerprint Details/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText(/On-Chain Commitment Hash:/i)).toBeInTheDocument()
    expect(screen.getByText(/Computed Local Hash:/i)).toBeInTheDocument()
    expect(screen.getByText(/Document Text Keccak-256 Hash:/i)).toBeInTheDocument()
  })

  it('allows user input in textarea and calls onPlaintextChange callback', () => {
    const handleChange = vi.fn()
    render(
      <TermsVerifier
        canonicalTerms={mockPact}
        onChainTermsHash={onChainHash}
        plaintextTerms=""
        onPlaintextChange={handleChange}
        isTaker={true}
      />
    )

    const textarea = screen.getByPlaceholderText(/Paste the written agreement plaintext/i)
    fireEvent.change(textarea, { target: { value: 'New text' } })

    expect(handleChange).toHaveBeenCalledWith('New text')
  })
})
