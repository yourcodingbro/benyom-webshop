import type React from 'react'

import { Skeleton } from '@/components/shadcn/skeleton'

/** Same grid and tile size as the page's tiles (name + description). */
export default function BrandsLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">A márkák betöltése…</span>
      <Skeleton className="mb-4 h-5 w-32" />
      <Skeleton className="h-9 w-52 sm:h-10" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }, (_: unknown, index: number) => (
          <div key={index} className="space-y-2 rounded-2xl bg-muted p-5">
            <Skeleton className="h-6 w-2/3 bg-background/70" />
            <Skeleton className="h-4 w-full bg-background/70" />
          </div>
        ))}
      </div>
    </div>
  )
}
