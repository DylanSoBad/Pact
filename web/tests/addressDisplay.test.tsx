import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import AddressDisplay from '../components/AddressDisplay'

describe('AddressDisplay Component', () => {
  const TEST_ADDR = '0x1234567890abcdef1234567890abcdef12345678'

  it('renders truncated address by default', () => {
    render(<AddressDisplay address={TEST_ADDR} />)
    expect(screen.getByText('0x1234…5678')).toBeDefined()
  })

  it('provides accessible copy button with clipboard interaction', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    render(<AddressDisplay address={TEST_ADDR} />)
    const copyButton = screen.getByRole('button', { name: /Copy address/i })
    expect(copyButton).toBeDefined()

    fireEvent.click(copyButton)
    expect(writeTextMock).toHaveBeenCalledWith(TEST_ADDR)
    expect(await screen.findByText('Copied ✓')).toBeDefined()
  })

  it('provides verified ArcScan explorer link', () => {
    render(<AddressDisplay address={TEST_ADDR} />)
    const explorerLink = screen.getByRole('link', { name: /ArcScan explorer/i })
    expect(explorerLink).toBeDefined()
    expect(explorerLink.getAttribute('href')).toBe(`https://testnet.arcscan.app/address/${TEST_ADDR}`)
    expect(explorerLink.getAttribute('target')).toBe('_blank')
  })

  it('allows expanding to full address when showFullToggle is enabled', () => {
    render(<AddressDisplay address={TEST_ADDR} showFullToggle={true} />)
    const toggleButton = screen.getByRole('button', { name: /Show full address/i })
    expect(toggleButton).toBeDefined()

    fireEvent.click(toggleButton)
    expect(screen.getAllByText(TEST_ADDR).length).toBeGreaterThan(0)
  })
})
