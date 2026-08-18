'use client'

import { useState, useRef, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { ERC20_ABI } from '../lib/abi'

type Token = { value: string; label: string }

export default function TokenSelect({
  tokens,
  value,
  onChange,
  label
}: {
  tokens: Token[]
  value: string
  onChange: (val: string) => void
  label: string
}) {
  const { address } = useAccount()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredTokens = tokens.filter(t => t.label.toLowerCase().includes(search.toLowerCase()))

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(!isOpen)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const selectedToken = tokens.find(t => t.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs font-mono text-[var(--color-muted)] mb-2 uppercase">{label}</label>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-black border border-[var(--color-line)] text-[var(--color-text)] px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)] cursor-pointer flex justify-between items-center"
      >
        <span>{selectedToken?.label || 'Select Token'}</span>
        <span className="text-[var(--color-muted)]">▼</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-black border border-[var(--color-line)] shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-[var(--color-line)] sticky top-0 bg-black">
            <input
              type="text"
              autoFocus
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black border border-[var(--color-line)] text-white px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lime)]"
            />
          </div>
          {filteredTokens.length === 0 ? (
            <div className="px-3 py-2 text-xs font-mono text-[var(--color-muted)]">No tokens found</div>
          ) : (
            filteredTokens.map(t => (
              <TokenOption
                key={t.value}
                token={t}
                address={address}
                isSelected={t.value === value}
                onSelect={() => {
                  onChange(t.value)
                  setIsOpen(false)
                  setSearch('')
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TokenOption({ token, address, isSelected, onSelect }: { token: Token; address?: `0x${string}`; isSelected: boolean; onSelect: () => void }) {
  const { data: balanceData } = useReadContract({
    address: token.value as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: decimalsData } = useReadContract({
    address: token.value as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })

  const decimals = Number(decimalsData ?? 6)
  const balance = (balanceData as bigint) ?? 0n
  const formattedBal = Number(formatUnits(balance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })

  return (
    <div
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`px-3 py-2 font-mono text-sm cursor-pointer flex justify-between items-center hover:bg-[var(--color-line)] focus-visible:bg-[var(--color-line)] focus-visible:outline-none ${isSelected ? 'text-[var(--color-lime)]' : 'text-white'}`}
    >
      <span>{token.label}</span>
      <span className="text-xs text-[var(--color-muted)]">{formattedBal}</span>
    </div>
  )
}
