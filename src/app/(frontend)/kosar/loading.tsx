import type React from 'react'

import { CartPageContentSkeleton } from '@/components/cart/CartPageContent'
import { Skeleton } from '@/components/shadcn/skeleton'

export default function CartLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">A kosár betöltése…</span>
      <Skeleton className="mb-4 h-5 w-24" />
      <Skeleton className="mb-6 h-9 w-32" />
      <CartPageContentSkeleton />
    </div>
  )
}
