'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { SEARCH_DEBOUNCE_MS } from '@/config/shop'
import { useListingUrl } from '@/hooks/useListingUrl'
import { checkPriceRange } from '@/lib/price-filter'

/** Sidebar filters as they appear in the URL (colors: lowercase hex without '#'). */
export type ListingFilterState = {
  brand: string
  category: string
  colors: string[]
  storage: string[]
  minPrice: string
  maxPrice: string
}

type UseListingFiltersParams = {
  /** Route-fixed dimensions are never written to the query string. */
  lockBrand: boolean
  lockCategory: boolean
}

type UseListingFiltersResult = {
  state: ListingFilterState
  setBrand: (value: string) => void
  setCategory: (value: string) => void
  toggleColor: (value: string) => void
  toggleStorage: (value: string) => void
  setMinPrice: (value: string) => void
  setMaxPrice: (value: string) => void
  /** Clears every sidebar filter; search and sorting stay. */
  clear: () => void
  /** Shown after the debounce when the typed range is invalid. */
  priceError: { field: 'min' | 'max'; message: string } | null
  hasActiveFilters: boolean
}

const PARAM = { brand: 'marka', category: 'kategoria', colors: 'szin', storage: 'tarhely', minPrice: 'ar_min', maxPrice: 'ar_max' } as const

const EMPTY: ListingFilterState = { brand: '', category: '', colors: [], storage: [], minPrice: '', maxPrice: '' }

function list(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value: string) => value.split(','))
    .filter(Boolean)
}

function readState(params: URLSearchParams): ListingFilterState {
  return {
    brand: params.get(PARAM.brand) ?? '',
    category: params.get(PARAM.category) ?? '',
    colors: list(params, PARAM.colors).map((value: string) => value.toLowerCase()),
    storage: list(params, PARAM.storage),
    minPrice: params.get(PARAM.minPrice) ?? '',
    maxPrice: params.get(PARAM.maxPrice) ?? '',
  }
}

function setOrDelete(params: URLSearchParams, name: string, value: string): void {
  if (value) params.set(name, value)
  else params.delete(name)
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item: string) => item !== value) : [...values, value]
}

/**
 * Sidebar filters that apply themselves: selections immediately (one history entry each),
 * price fields 300 ms after typing stops (replace, no history spam). Invalid price ranges are
 * shown but never applied; the last valid range stays in the URL. Pagination resets, and
 * search and sorting are kept, via useListingUrl. Back/forward re-sync the controls.
 */
export function useListingFilters(params: UseListingFiltersParams): UseListingFiltersResult {
  const searchParams = useSearchParams()
  const { update } = useListingUrl()
  const urlState = readState(searchParams)
  const urlKey = JSON.stringify(urlState)

  const [state, setState] = useState<ListingFilterState>(urlState)
  const [seenKey, setSeenKey] = useState<string>(urlKey)
  const [requestedKey, setRequestedKey] = useState<string>(urlKey)
  const [priceError, setPriceError] = useState<UseListingFiltersResult['priceError']>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // URL changed: our own request completing keeps local state; external changes (back/forward, links) replace it.
  if (urlKey !== seenKey) {
    setSeenKey(urlKey)
    if (urlKey !== requestedKey) {
      setState(urlState)
      setRequestedKey(urlKey)
      setPriceError(null)
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const apply = useCallback(
    (next: ListingFilterState, history: 'push' | 'replace'): void => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const price = checkPriceRange(next.minPrice, next.maxPrice)
      setPriceError(price.ok ? null : { field: price.field, message: price.error })
      update({
        history,
        mutate: (query: URLSearchParams) => {
          if (!params.lockBrand) setOrDelete(query, PARAM.brand, next.brand)
          if (!params.lockCategory) setOrDelete(query, PARAM.category, next.category)
          setOrDelete(query, PARAM.colors, next.colors.join(','))
          setOrDelete(query, PARAM.storage, next.storage.join(','))
          // An invalid range is never applied: the URL keeps the last valid one.
          if (price.ok) {
            setOrDelete(query, PARAM.minPrice, price.min === null ? '' : String(price.min))
            setOrDelete(query, PARAM.maxPrice, price.max === null ? '' : String(price.max))
          }
        },
      })
      setRequestedKey(
        JSON.stringify({
          ...next,
          ...(price.ok ? { minPrice: price.min === null ? '' : String(price.min), maxPrice: price.max === null ? '' : String(price.max) } : {}),
        }),
      )
    },
    [params.lockBrand, params.lockCategory, update],
  )

  // Latest local state for event handlers (side effects must stay out of setState updaters).
  const latest = useRef<ListingFilterState>(state)
  useEffect(() => {
    latest.current = state
  }, [state])

  const commit = useCallback((next: ListingFilterState): void => {
    latest.current = next
    setState(next)
  }, [])

  const select = useCallback(
    (change: (current: ListingFilterState) => ListingFilterState): void => {
      const next = change(latest.current)
      commit(next)
      apply(next, 'push')
    },
    [apply, commit],
  )

  const typePrice = useCallback(
    (field: 'minPrice' | 'maxPrice', value: string): void => {
      const next = { ...latest.current, [field]: value }
      commit(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => apply(next, 'replace'), SEARCH_DEBOUNCE_MS)
    },
    [apply, commit],
  )

  const hasActiveFilters =
    (!params.lockBrand && state.brand !== '') ||
    (!params.lockCategory && state.category !== '') ||
    state.colors.length > 0 ||
    state.storage.length > 0 ||
    state.minPrice.trim() !== '' ||
    state.maxPrice.trim() !== ''

  return {
    state,
    setBrand: (value: string) => select((current) => ({ ...current, brand: value })),
    setCategory: (value: string) => select((current) => ({ ...current, category: value })),
    toggleColor: (value: string) => select((current) => ({ ...current, colors: toggle(current.colors, value) })),
    toggleStorage: (value: string) => select((current) => ({ ...current, storage: toggle(current.storage, value) })),
    setMinPrice: (value: string) => typePrice('minPrice', value),
    setMaxPrice: (value: string) => typePrice('maxPrice', value),
    clear: () => select((current) => ({ ...EMPTY, brand: params.lockBrand ? current.brand : '', category: params.lockCategory ? current.category : '' })),
    priceError,
    hasActiveFilters,
  }
}
