'use client'

import Link from 'next/link'

export default function TapeLine({ pact }: { pact: any }) {
  const statusColor = (status: string) => {
    switch (status) {
      case 'LIVE': return 'text-[var(--color-red)] animate-pulse';
      case 'CLEARED': return 'text-[var(--color-lime)]';
      case 'SLASHED': return 'text-[var(--color-amber)]';
      case 'EXPIRED': return 'text-gray-500';
      case 'PROOF IN': return 'text-[var(--color-lime)] ring-1 ring-[var(--color-lime)] px-1';
      default: return 'text-[var(--color-muted)]';
    }
  };

  return (
    <Link href={`/p/${pact.id}`} className="block">
      <div className="flex flex-row items-center justify-between py-2 border-b border-[var(--color-line)] font-mono text-sm hover:bg-[var(--color-panel)] transition-colors cursor-pointer px-4">
        <div className="flex gap-4 items-center">
          <span className="text-[var(--color-muted)] w-20">{pact.time}</span>
          <span className="w-12">{pact.kind}</span>
          <span className="w-16 text-[var(--color-muted)]">#{pact.id}</span>
          <span className={`w-24 font-bold ${statusColor(pact.status)}`}>{pact.status}</span>
        </div>
        <div className="flex gap-8 items-center">
          <span className="text-right">
            {pact.blurSize ? (
              <span className="text-[var(--color-muted)] italic" title="cosmetic only — amounts are public onchain">SIZE HIDDEN</span>
            ) : (
              pact.amount
            )}
          </span>
          <span className="w-24 text-[var(--color-muted)] text-right">{pact.address}</span>
        </div>
      </div>
    </Link>
  );
}
