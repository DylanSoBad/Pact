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
      <label className="block text-[12px] text-zinc-500 mb-1.5">{label}</label>
      <div
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen) } else if (e.key === 'Escape') setIsOpen(false) }}
        className="w-full bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] text-white px-3.5 py-2.5 rounded-xl text-[14px] cursor-pointer flex justify-between items-center transition-all active:scale-[0.98]"
      >
        <span className="font-medium">{selected?.label || 'Select'}</span>
        <span className="text-zinc-500 text-[10px] transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#121316] border border-white/[0.08] rounded-xl shadow-2xl max-h-48 overflow-y-auto p-1 animate-enter">
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
      className={`px-3 py-2 rounded-lg text-[13px] cursor-pointer flex justify-between items-center transition-all active:scale-[0.98] ${
        isSelected ? 'bg-white/[0.1] text-white font-medium' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-white'
      }`}>
      <span>{token.label}</span>
      <span className="text-[11px] text-zinc-500">{fmt}</span>
    </div>
  )
}
