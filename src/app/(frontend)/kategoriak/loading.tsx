import type React from 'react'

import { TileGridSkeleton } from '@/components/product/TileGridSkeleton'
import { Skeleton } from '@/components/shadcn/skeleton'

/** Breadcrumb and heading placeholders sized for this page; the tile grid is shared with /markak. */
export default function CategoriesLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Skeleton className="mb-4 h-5 w-32" />
      <Skeleton className="h-9 w-64 sm:h-10" />
      <TileGridSkeleton label="A kategóriák betöltése…" />
    </div>
  )
}
