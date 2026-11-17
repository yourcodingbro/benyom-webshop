import type React from 'react'

import { CheckoutFormSkeleton } from '@/components/checkout/CheckoutForm'
import { Skeleton } from '@/components/shadcn/skeleton'

export default function CheckoutLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">A pénztár betöltése…</span>
      <Skeleton className="mb-4 h-5 w-40" />
      <Skeleton className="mb-6 h-9 w-72" />
      <CheckoutFormSkeleton />
    </div>
  )
}
