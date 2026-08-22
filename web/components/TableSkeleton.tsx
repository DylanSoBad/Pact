'use client'

interface TableSkeletonProps {
  rows?: number
}

export default function TableSkeleton({ rows = 5 }: TableSkeletonProps) {
  return (
    <div 
      aria-label="Loading contracts stream" 
      className="divide-y divide-outline-hairline/40 w-full font-code-hash animate-pulse"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="px-md py-4 border-b border-outline-hairline bg-surface-container-low/10"
        >
          {/* Desktop Skeleton Grid */}
          <div className="hidden @md:grid grid-cols-5 gap-4 items-center">
            <div className="col-span-1 flex flex-col gap-1.5">
              <div className="h-2.5 w-16 bg-surface-container-high rounded" />
              <div className="h-3.5 w-20 bg-surface-container-highest rounded" />
            </div>
            <div className="col-span-1">
              <div className="h-4 w-14 bg-surface-container-high rounded" />
            </div>
            <div className="col-span-1 flex justify-end">
              <div className="h-4 w-28 bg-surface-container-highest rounded" />
            </div>
            <div className="col-span-1 flex justify-center">
              <div className="h-4 w-16 bg-surface-container-high rounded" />
            </div>
            <div className="col-span-1 flex justify-end">
              <div className="h-3 w-20 bg-surface-container-high rounded" />
            </div>
          </div>

          {/* Mobile Skeleton Card */}
          <div className="@md:hidden flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-4 w-12 bg-surface-container-highest rounded" />
                <div className="h-3 w-10 bg-surface-container-high rounded" />
                <div className="h-3 w-14 bg-surface-container-low rounded" />
              </div>
              <div className="h-4 w-20 bg-surface-container-highest rounded" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 bg-surface-container-high rounded" />
              <div className="h-3 w-24 bg-surface-container-low rounded" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading contract data stream from Arc Testnet...</span>
    </div>
  )
}
