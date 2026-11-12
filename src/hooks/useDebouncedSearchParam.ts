'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useListingUrl } from '@/hooks/useListingUrl'

type UseDebouncedSearchParamParams = {
  /** URL parameter holding the applied query, e.g. "q". */
  param: string
  delayMs: number
}

type UseDebouncedSearchParamResult = {
  /** Input value; updates immediately on every keystroke. */
  value: string
  setValue: (value: string) => void
  /** Applies the current value now (e.g. on Enter). */
  flush: () => void
  /** A keystroke is waiting for the debounce delay. */
  debouncing: boolean
}

/**
 * Live search synchronised with the URL:
 * - the input updates immediately; the URL (and so the server request) only after `delayMs` idle;
 * - clearing applies at once; pagination resets and every other parameter is kept (useListingUrl);
 * - `replace` is used, so typing adds no history entries;
 * - only explicit applies navigate (no effect writes the URL) and no-op URLs are skipped;
 * - back/forward (or links) that change the parameter update the input, without clobbering
 *   text typed after our own request was sent.
 */
export function useDebouncedSearchParam(params: UseDebouncedSearchParamParams): UseDebouncedSearchParamResult {
  const searchParams = useSearchParams()
  const { update } = useListingUrl()
  const urlValue = searchParams.get(params.param) ?? ''

  const [value, setValueState] = useState<string>(urlValue)
  const [seenUrlValue, setSeenUrlValue] = useState<string>(urlValue)
  const [requested, setRequested] = useState<string>(urlValue)
  const [debouncing, setDebouncing] = useState<boolean>(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestedRef = useRef<string>(urlValue)

  // Adjust state while rendering when the URL changed (React's recommended alternative to an effect).
  if (urlValue !== seenUrlValue) {
    setSeenUrlValue(urlValue)
    // Our own request coming back must not overwrite newer typing; external changes (back/forward) must.
    if (urlValue !== requested) {
      setValueState(urlValue)
      setRequested(urlValue)
    }
  }

  // External URL change: a pending debounce belongs to the old query, drop it.
  useEffect(() => {
    if (urlValue === requestedRef.current) return
    requestedRef.current = urlValue
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [urlValue])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const apply = useCallback(
    (raw: string): void => {
      timer.current = null
      setDebouncing(false)
      const term = raw.trim()
      const navigated = update({
        history: 'replace',
        mutate: (query: URLSearchParams) => {
          if (term) query.set(params.param, term)
          else query.delete(params.param)
        },
      })
      if (!navigated) return
      requestedRef.current = term
      setRequested(term)
    },
    [params.param, update],
  )

  const setValue = useCallback(
    (next: string): void => {
      setValueState(next)
      if (timer.current) clearTimeout(timer.current)
      if (next.trim() === '') {
        apply('')
        return
      }
      setDebouncing(true)
      timer.current = setTimeout(() => apply(next), params.delayMs)
    },
    [apply, params.delayMs],
  )

  const flush = useCallback((): void => {
    if (timer.current) clearTimeout(timer.current)
    apply(value)
  }, [apply, value])

  return { value, setValue, flush, debouncing }
}
