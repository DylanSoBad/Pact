import { describe, expect, it, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Home from '../app/page'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { arcTestnet } from '../lib/arc'

// Mock Wagmi & queries
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const config = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
})

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

describe('Protocol Intro Gate', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    sessionStorage.setItem('pact-vantage-guide-seen', 'true')
  })

  it('renders intro gate on first visit in session and closes on X button click', () => {
    render(
      <Wrapper>
        <Home />
      </Wrapper>
    )

    expect(screen.getByRole('dialog', { name: /how pact works/i })).toBeDefined()
    expect(screen.getByText('Architecture & Settlement Flow')).toBeDefined()

    const closeButton = screen.getByRole('button', { name: /close protocol introduction/i })
    fireEvent.click(closeButton)

    expect(sessionStorage.getItem('pact-protocol-intro-seen')).toBe('true')
    expect(screen.queryByRole('dialog', { name: /how pact works/i })).toBeNull()
  })

  it('closes intro gate and saves session state when "Skip to features" is clicked', () => {
    render(
      <Wrapper>
        <Home />
      </Wrapper>
    )

    const skipButton = screen.getByRole('button', { name: /skip to features/i })
    fireEvent.click(skipButton)

    expect(sessionStorage.getItem('pact-protocol-intro-seen')).toBe('true')
    expect(screen.queryByRole('dialog', { name: /how pact works/i })).toBeNull()
  })

  it('closes intro gate on Escape key press', () => {
    render(
      <Wrapper>
        <Home />
      </Wrapper>
    )

    expect(screen.getByRole('dialog', { name: /how pact works/i })).toBeDefined()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(sessionStorage.getItem('pact-protocol-intro-seen')).toBe('true')
    expect(screen.queryByRole('dialog', { name: /how pact works/i })).toBeNull()
  })

  it('does not show intro gate if already seen in sessionStorage', () => {
    sessionStorage.setItem('pact-protocol-intro-seen', 'true')

    render(
      <Wrapper>
        <Home />
      </Wrapper>
    )

    expect(screen.queryByRole('dialog', { name: /how pact works/i })).toBeNull()
  })
})
