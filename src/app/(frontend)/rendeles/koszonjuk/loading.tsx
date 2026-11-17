import type React from 'react'

import { OrderSummarySkeleton } from '@/components/checkout/OrderSummary'
import { Skeleton } from '@/components/shadcn/skeleton'

export default function ConfirmationLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">A rendelés adatainak betöltése…</span>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="mt-8 h-9 w-3/4" />
      <Skeleton className="mt-3 h-5 w-full" />
      <Skeleton className="my-6 h-20 w-full rounded-lg" />
      <OrderSummarySkeleton />
    </div>
  )
}
