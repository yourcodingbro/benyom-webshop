import type React from 'react'

import { PopularSelectorSkeleton } from '@/components/home/PopularSelector'
import { ProductCardSkeleton } from '@/components/product/ProductCard'
import { Skeleton } from '@/components/shadcn/skeleton'

/** Home page: dark hero, the two popularity panels and the featured product grid. */
export default function HomeLoading(): React.JSX.Element {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">A főoldal betöltése…</span>
      <div aria-hidden="true">
        <section className="bg-ink">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 md:py-24">
            <div>
              <Skeleton className="h-4 w-40 bg-white/15" />
              <Skeleton className="mt-3 h-10 w-full max-w-3xl bg-white/15 sm:h-12" />
              <Skeleton className="mt-2 h-10 w-2/3 max-w-xl bg-white/15 sm:h-12" />
              <Skeleton className="mt-5 h-6 w-full max-w-2xl bg-white/15" />
              <div className="mt-8 flex flex-wrap gap-3">
                <Skeleton className="h-11 w-44 rounded-full bg-white/15" />
                <Skeleton className="h-11 w-48 rounded-full bg-white/15" />
              </div>
            </div>
          </div>
        </section>
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2">
          <PopularSelectorSkeleton />
          <PopularSelectorSkeleton />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Skeleton className="h-8 w-56" />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((card: number) => (
              <ProductCardSkeleton key={card} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
