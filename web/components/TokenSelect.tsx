'use client'

import { useState, useRef, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { ERC20_ABI } from '../lib/abi'

type Token = { value: string; label: string }

export default function TokenSelect({ tokens, value, onChange, label }: {
  tokens: Token[]; value: string; onChange: (val: string) => void; label: string
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
    <div className="relative" ref={ref}>
      <label className="block text-[11px] font-mono text-zinc-500 mb-1.5 uppercase tracking-wider">{label}</label>
      <div
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen) } else if (e.key === 'Escape') setIsOpen(false) }}
        className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-100 px-3 py-2 rounded-md font-mono text-xs cursor-pointer flex justify-between items-center transition-colors"
      >
        <span className="font-medium">{selected?.label || 'Select'}</span>
        <span className="text-zinc-600 text-[10px]">▼</span>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl max-h-48 overflow-y-auto">
          {tokens.map(t => (
            <TokenOption key={t.value} token={t} address={address} isSelected={t.value === value}
              onSelect={() => { onChange(t.value); setIsOpen(false) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function TokenOption({ token, address, isSelected, onSelect }: { token: Token; address?: `0x${string}`; isSelected: boolean; onSelect: () => void }) {
  const { data: balanceData } = useReadContract({
    address: token.value as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined, query: { enabled: !!address },
  })
  const { data: decimalsData } = useReadContract({
    address: token.value as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals',
  })
  const decimals = Number(decimalsData ?? 6)
  const balance = (balanceData as bigint) ?? 0n
  const fmt = Number(formatUnits(balance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })

  return (
    <div tabIndex={0} onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`px-3 py-2 font-mono text-xs cursor-pointer flex justify-between items-center transition-colors ${
        isSelected ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-200 hover:bg-zinc-800'
      }`}>
      <span>{token.label}</span>
      <span className="text-[11px] text-zinc-500">{fmt}</span>
    </div>
  )
}
