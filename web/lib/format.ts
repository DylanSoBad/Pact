import { USDC_ERC20, EURC } from './arc'

const DECIMALS = 6

export const KIND_LABELS = ['DELIVERY', 'FX', 'JOB'] as const
export const STATUS_LABELS = ['OPEN', 'FUNDED', 'ACTIVE', 'PROOF IN', 'CLEARED', 'SLASHED', 'EXPIRED', 'CANCELLED', 'DISPUTED'] as const

export function kindLabel(kind: number): string {
  return KIND_LABELS[kind] ?? `KIND(${kind})`
}

export function statusLabel(status: number): string {
  return STATUS_LABELS[status] ?? `STATUS(${status})`
}

export function tokenSymbol(addr: string): string {
  const lower = addr.toLowerCase()
  if (lower === USDC_ERC20.toLowerCase()) return 'USDC'
  if (lower === EURC.toLowerCase()) return 'EURC'
  return truncateAddress(addr)
}

export function formatAmount(raw: bigint | number): string {
  const n = Number(raw) / 10 ** DECIMALS
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function parseAmount(human: string): bigint {
  const cleaned = human.replace(/,/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num) || num < 0) return 0n
  return BigInt(Math.round(num * 10 ** DECIMALS))
}

export function truncateAddress(addr: string): string {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function statusColor(status: number): string {
  switch (status) {
    case 0: return 'text-[var(--color-muted)]'        // Open
    case 1: return 'text-[var(--color-muted)]'        // Funded
    case 2: return 'text-[var(--color-red)]'           // Active (LIVE)
    case 3: return 'text-[var(--color-lime)]'          // ProofSubmitted
    case 4: return 'text-[var(--color-lime)]'          // Cleared
    case 5: return 'text-[var(--color-amber)]'         // Slashed
    case 6: return 'text-gray-500'                     // Expired
    case 7: return 'text-gray-500'                     // Cancelled
    case 8: return 'text-amber-400'                    // Disputed / Arbitration
    default: return 'text-[var(--color-muted)]'
  }
}

export function formatTimestamp(ts: bigint | number): string {
  const date = new Date(Number(ts) * 1000)
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDate(ts: bigint | number): string {
  const date = new Date(Number(ts) * 1000)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + formatTimestamp(ts)
}

export function isTerminal(status: number): boolean {
  return status >= 4 // Cleared, Slashed, Expired, Cancelled
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

export function isZeroAddress(addr: string): boolean {
  return !addr || addr === ZERO_ADDR
}
