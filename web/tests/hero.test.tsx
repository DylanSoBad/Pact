import { describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import Hero, { HERO_VIDEO_URL } from '../components/Hero'

describe('Hero Component', () => {
  it('renders semantic H1 headline and eyebrow', () => {
    render(<Hero />)

    const heading = screen.getByRole('heading', { level: 1, name: 'Agreements, Made Unbreakable.' })
    expect(heading).toBeDefined()

    expect(screen.getByText('INSTITUTIONAL ESCROW · ARC TESTNET')).toBeDefined()
    expect(
      screen.getByText(
        'Create verifiable economic agreements, lock exact collateral on-chain, and settle through transparent rules on Arc.'
      )
    ).toBeDefined()
  })

  it('renders Primary CTA linking to /new and Secondary CTA linking to #live-pacts', () => {
    render(<Hero />)

    const createCta = screen.getByRole('link', { name: /create new pact/i })
    expect(createCta).toBeDefined()
    expect(createCta.getAttribute('href')).toBe('/new')

    const exploreCta = screen.getByRole('link', { name: /explore live pacts/i })
    expect(exploreCta).toBeDefined()
    expect(exploreCta.getAttribute('href')).toBe('#live-pacts')
  })

  it('renders semantic video background with accessibility attributes and isolated URL', () => {
    const { container } = render(<Hero />)

    const video = container.querySelector('video')
    expect(video).toBeDefined()
    expect(video?.getAttribute('src')).toBe(HERO_VIDEO_URL)
    expect(video?.getAttribute('aria-hidden')).toBe('true')
    expect(video?.getAttribute('tabIndex')).toBe('-1')
    expect(video?.hasAttribute('autoplay')).toBe(true)
    expect(video?.muted).toBe(true)
    expect(video?.hasAttribute('loop')).toBe(true)
    expect(video?.hasAttribute('playsinline')).toBe(true)
    expect(video?.className).toContain('motion-reduce:hidden')
  })

  it('renders protocol status line and decorative telemetry markers with aria-hidden', () => {
    const { container } = render(<Hero />)

    expect(
      screen.getByText('NON-CUSTODIAL · EXACT ERC-20 APPROVALS · ON-CHAIN TERMS HASH')
    ).toBeDefined()

    const decorativeSpans = container.querySelectorAll('span[aria-hidden="true"]')
    expect(decorativeSpans.length).toBeGreaterThan(4)
  })
})
