import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center px-6 text-center font-code-hash">
      <p className="text-primary-fixed text-[12px] uppercase">Signal lost</p>
      <h1 className="mt-2 font-display-mono text-3xl text-on-surface uppercase">404 — Page Not Found</h1>
      <p className="mt-3 max-w-md text-[13px] text-text-muted">The pact you&apos;re looking for doesn&apos;t exist, or its address has changed.</p>
      <Link href="/" className="mt-6 border border-primary-fixed px-4 py-3 text-[12px] text-primary-fixed hover:bg-primary-fixed hover:text-on-primary-fixed">← Back to Tape</Link>
    </div>
  )
}
