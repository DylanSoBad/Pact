import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PageSkeleton from '../components/PageSkeleton'

describe('PageSkeleton', () => {
  it('announces directory loading without exposing decorative bars', () => {
    render(<PageSkeleton variant="directory" />)
    expect(screen.getByRole('status', { name: 'Loading PACT directory' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading the latest indexed pacts.')).toBeInTheDocument()
  })

  it('announces verified pact detail loading', () => {
    render(<PageSkeleton variant="detail" />)
    expect(screen.getByRole('status', { name: 'Loading verified pact details' })).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Reading verified on-chain pact state from Arc Testnet.')).toBeInTheDocument()
  })
})
