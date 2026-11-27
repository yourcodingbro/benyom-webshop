import type React from 'react'

import { Skeleton } from '@/components/shadcn/skeleton'

type TileGridSkeletonProps = { label: string; columns?: 3 | 4 }

// Full class names so Tailwind generates both.
const LG_COLUMNS = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' } as const

/**
 * Loading state for the /kategoriak and /markak tile grids (name + description); `label` is announced to screen
 * readers, `columns` matches the page's large-screen column count.
 */
export function TileGridSkeleton({ label, columns = 4 }: TileGridSkeletonProps): React.JSX.Element {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className={`mt-8 grid gap-4 sm:grid-cols-2 ${LG_COLUMNS[columns]}`} aria-hidden="true">
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
