'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'

import { useListingTransition } from '@/hooks/useListingTransition'

export type ListingUrlChange = {
  /** Edits a copy of the current query string. */
  mutate: (params: URLSearchParams) => void
  /** replace: no history entry (typing); push: one entry (explicit choice). */
  history: 'push' | 'replace'
}

type UseListingUrlResult = {
  /** Applies a change, resets the page and navigates; returns false when the URL would not change. */
  update: (change: ListingUrlChange) => boolean
}

export const LISTING_PAGE_PARAM: string = 'oldal'

/**
 * Single place where the listing writes its URL. Reads the live location (never a stale render
 * snapshot), always resets pagination, skips no-op navigations (no duplicate requests) and runs
 * inside the shared transition so the newest navigation wins over older in-flight ones.
 */
export function useListingUrl(): UseListingUrlResult {
  const router = useRouter()
  const pathname = usePathname()
  const { startTransition } = useListingTransition()

  const update = useCallback(
    (change: ListingUrlChange): boolean => {
      const params = new URLSearchParams(window.location.search)
      const before = params.toString()
      change.mutate(params)
      params.delete(LISTING_PAGE_PARAM)
      const after = params.toString()
      if (after === before) return false
      const href = after ? `${pathname}?${after}` : pathname
      startTransition(() => (change.history === 'push' ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })))
      return true
    },
    [pathname, router, startTransition],
  )

  return { update }
}
