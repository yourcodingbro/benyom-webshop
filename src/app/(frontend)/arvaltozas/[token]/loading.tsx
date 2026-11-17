import type React from 'react'

import { Skeleton } from '@/components/shadcn/skeleton'

/** Same layout as the decision page: title, explanation, price table and the two decision boxes. */
export default function PriceChangeLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">Az árváltozási ajánlat betöltése…</span>
      <div aria-hidden="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-3 h-5 w-full" />
        <div className="mt-6 divide-y border-y">
          {[0, 1, 2].map((row: number) => (
            <div key={row} className="flex justify-between gap-4 py-2.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1].map((box: number) => (
            <div key={box} className="space-y-3 rounded-xl border p-4">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
