import type React from 'react'

import { cn } from '@/lib/utils'

/** shadcn/ui Skeleton: a non-interactive placeholder block; the caller announces the loading state. */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="skeleton" aria-hidden="true" className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)} {...props} />
}

export { Skeleton }
