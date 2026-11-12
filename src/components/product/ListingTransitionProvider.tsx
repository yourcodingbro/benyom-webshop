'use client'

import type React from 'react'
import { useMemo, useTransition } from 'react'

import { ListingTransitionContext, useListingTransition, type UseListingTransitionResult } from '@/hooks/useListingTransition'
import { cn } from '@/lib/utils'

type ListingTransitionProviderProps = {
  children: React.ReactNode
}

/** Owns the transition used for listing navigations, so search, sort, filters and results share its pending state. */
export function ListingTransitionProvider(props: ListingTransitionProviderProps): React.JSX.Element {
  const [isPending, startTransition] = useTransition()
  const value = useMemo<UseListingTransitionResult>(() => ({ isPending, startTransition }), [isPending])
  return <ListingTransitionContext.Provider value={value}>{props.children}</ListingTransitionContext.Provider>
}

type ListingResultsProps = {
  children: React.ReactNode
}

/** Keeps the current results visible (dimmed, aria-busy) while newer ones load, so nothing jumps. */
export function ListingResults(props: ListingResultsProps): React.JSX.Element {
  const { isPending } = useListingTransition()
  return (
    <div aria-busy={isPending} className={cn('transition-opacity duration-150', isPending && 'pointer-events-none opacity-50')}>
      {props.children}
    </div>
  )
}
