import { describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import SecurityInfrastructure from '../components/SecurityInfrastructure'
import { arcTestnet } from '../lib/arc'

describe('SecurityInfrastructure Component', () => {
  it('renders section heading and Arc network chain ID', () => {
    render(<SecurityInfrastructure />)

    expect(screen.getByRole('heading', { level: 2, name: 'Verify the infrastructure.' })).toBeDefined()
    expect(screen.getByText('Arc Testnet')).toBeDefined()
    expect(screen.getByText(String(arcTestnet.id))).toBeDefined()
  })

  it('displays truthful audit status without exaggerated claims', () => {
    render(<SecurityInfrastructure />)

    expect(screen.getByText('Audit: planned')).toBeDefined()
    expect(screen.getByText(/Testnet environment · Smart contracts are fully open-source and deterministic/i)).toBeDefined()
  })

  it('ensures all external links have target="_blank" and rel="noopener noreferrer"', () => {
    const { container } = render(<SecurityInfrastructure />)

    const externalLinks = container.querySelectorAll('a[target="_blank"]')
    expect(externalLinks.length).toBeGreaterThanOrEqual(3)

    externalLinks.forEach((link) => {
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    })
  })
})
