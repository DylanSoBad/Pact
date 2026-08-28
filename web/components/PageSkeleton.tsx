type PageSkeletonProps = {
  variant?: 'directory' | 'detail'
}

function Bar({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded-sm bg-surface-container-high ${className}`} />
}

export default function PageSkeleton({ variant = 'directory' }: PageSkeletonProps) {
  if (variant === 'detail') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading verified pact details"
        className="pact-skeleton w-full space-y-6 animate-pulse"
      >
        <header className="flex flex-col gap-4 border-b border-outline-hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Bar className="h-3 w-36" />
            <Bar className="h-8 w-56" />
          </div>
          <Bar className="h-8 w-40" />
        </header>

        <section className="pact-panel p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <Bar className="h-11 w-20 shrink-0" />
            <div className="w-full space-y-2">
              <Bar className="h-4 w-2/3 max-w-80" />
              <Bar className="h-3 w-full max-w-xl" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map(item => (
            <section key={item} className="pact-panel min-h-52 p-5">
              <Bar className="h-4 w-36" />
              <div className="mt-6 space-y-4">
                <Bar className="h-12 w-full" />
                <Bar className="h-12 w-full" />
                <Bar className="h-12 w-full" />
              </div>
            </section>
          ))}
        </div>

        <section className="pact-panel p-5">
          <Bar className="h-4 w-44" />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Bar className="h-20 w-full" />
            <Bar className="h-20 w-full" />
            <Bar className="h-20 w-full" />
          </div>
        </section>
        <span className="sr-only">Reading verified on-chain pact state from Arc Testnet.</span>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading PACT directory"
      className="pact-skeleton w-full space-y-6 animate-pulse"
    >
      <header className="space-y-3 border-b border-outline-hairline pb-5">
        <Bar className="h-3 w-44" />
        <Bar className="h-8 w-52" />
        <Bar className="h-3 w-full max-w-lg" />
      </header>
      <section className="grid grid-cols-2 gap-px border border-outline-hairline bg-outline-hairline lg:grid-cols-4">
        {[0, 1, 2, 3].map(item => (
          <div key={item} className="min-h-24 space-y-4 bg-surface p-4">
            <Bar className="h-3 w-20" />
            <Bar className="h-7 w-14" />
          </div>
        ))}
      </section>
      <section className="pact-panel overflow-hidden">
        {[0, 1, 2, 3, 4].map(item => (
          <div key={item} className="flex items-center justify-between gap-4 border-b border-outline-hairline p-4 last:border-b-0">
            <div className="space-y-2"><Bar className="h-4 w-28" /><Bar className="h-3 w-20" /></div>
            <Bar className="h-5 w-24" />
          </div>
        ))}
      </section>
      <span className="sr-only">Loading the latest indexed pacts.</span>
    </div>
  )
}
