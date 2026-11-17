import type React from 'react'

import { ProductConfiguratorSkeleton } from '@/components/product/ProductConfigurator'
import { Skeleton } from '@/components/shadcn/skeleton'

export default function ProductLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">A termék betöltése…</span>
      <Skeleton className="mb-4 h-5 w-56" />
      <ProductConfiguratorSkeleton />
    </div>
  )
}
