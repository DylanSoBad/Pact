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
      <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">{label}</label>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#111215] border border-[#222328] hover:border-[#32343c] text-zinc-100 px-3 py-2 rounded-md font-mono text-xs cursor-pointer flex justify-between items-center transition-colors shadow-sm"
      >
        <span className="font-semibold text-zinc-200">{selectedToken?.label || 'Select Token'}</span>
        <span className="text-zinc-500 text-[10px]">▼</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#141518] border border-[#282a30] rounded-md shadow-xl max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-[#222328] sticky top-0 bg-[#141518]">
            <input
              type="text"
              autoFocus
              placeholder="Search token..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0d0e11] border border-[#222328] text-zinc-100 px-2.5 py-1.5 rounded font-mono text-xs placeholder:text-zinc-600 focus:border-emerald-500"
            />
          </div>
          {filteredTokens.length === 0 ? (
            <div className="px-3 py-2.5 text-xs font-mono text-zinc-500 text-center">No tokens found</div>
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
      className={`px-3 py-2 font-mono text-xs cursor-pointer flex justify-between items-center transition-colors ${
        isSelected ? 'bg-emerald-500/10 text-emerald-400 font-semibold' : 'text-zinc-200 hover:bg-[#1c1d22]'
      }`}
    >
      <span>{token.label}</span>
      <span className="text-[11px] text-zinc-400 font-normal">Bal: {formattedBal}</span>
    </div>
  )
}
