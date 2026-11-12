'use client'

import { createContext, useContext } from 'react'

export type UseListingTransitionResult = {
  /** True while a listing navigation (search, sort) is rendering on the server. */
  isPending: boolean
  startTransition: (action: () => void) => void
}

export const ListingTransitionContext: React.Context<UseListingTransitionResult | null> = createContext<UseListingTransitionResult | null>(null)

/** Shared pending state between the listing toolbar and the results. Must be used below <ListingTransitionProvider>. */
export function useListingTransition(): UseListingTransitionResult {
  const context = useContext(ListingTransitionContext)
  if (!context) throw new Error('useListingTransition csak ListingTransitionProvider alatt használható.')
  return context
}
