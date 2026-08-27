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
  label,
}: {
  tokens: Token[]
  value: string
  onChange: (val: string) => void
  label: string
}) {
  const { address } = useAccount()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = tokens.find(t => t.value === value)

  return (
    <div className="relative font-mono" ref={ref}>
      <label className="block text-[11px] font-label-caps uppercase tracking-wider text-text-muted mb-1.5">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="w-full bg-[#07080a] border border-outline-border hover:border-outline-variant text-white px-3.5 py-2.5 text-[13px] font-code-hash flex justify-between items-center transition-colors focus-visible:border-primary-fixed focus-visible:outline-none"
      >
        <span className="font-bold text-primary-fixed">{selected?.label || 'Select token'}</span>
        <span className="text-text-muted text-[10px] transition-transform duration-150" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute z-50 w-full mt-1 bg-[#0c0f12] border border-outline-border shadow-2xl max-h-48 overflow-y-auto p-1 animate-enter"
        >
          {tokens.map(t => (
            <TokenOption
              key={t.value}
              token={t}
              address={address}
              isSelected={t.value === value}
              onSelect={() => {
                onChange(t.value)
                setIsOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TokenOption({
  token,
  address,
  isSelected,
  onSelect,
}: {
  token: Token
  address?: `0x${string}`
  isSelected: boolean
  onSelect: () => void
}) {
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
  const fmt = Number(formatUnits(balance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`px-3 py-2 text-[12px] font-code-hash cursor-pointer flex justify-between items-center transition-colors ${
        isSelected
          ? 'bg-primary-fixed text-[#090b0d] font-bold'
          : 'text-text-muted hover:bg-[#181e25] hover:text-white'
      }`}
    >
      <span className="font-bold">{token.label}</span>
      <span className={isSelected ? 'text-[#090b0d] text-[11px]' : 'text-text-dim text-[11px]'}>
        Bal: {fmt}
      </span>
    </div>
  )
}
