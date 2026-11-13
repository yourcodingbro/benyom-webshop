"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useListingUrl } from "@/hooks/useListingUrl";

type UseDebouncedSearchParamParams = {
  /** URL parameter holding the applied query, e.g. "q". */
  param: string;
  delayMs: number;
};

type UseDebouncedSearchParamResult = {
  /** Input value; updates immediately on every keystroke. */
  value: string;
  setValue: (value: string) => void;
  /** Applies the current value now (e.g. on Enter). */
  flush: () => void;
  /** A keystroke is waiting for the debounce delay. */
  debouncing: boolean;
};

/**
 * Live search synchronised with the URL:
 * - the input updates immediately; the URL (and so the server request) only after `delayMs` idle;
 * - clearing applies at once; pagination resets and every other parameter is kept (useListingUrl);
 * - `replace` is used, so typing adds no history entries;
 * - only explicit applies navigate (no effect writes the URL) and no-op URLs are skipped;
 * - back/forward (or links) that change the parameter update the input, without clobbering
 *   text typed after our own request was sent.
 */
export function useDebouncedSearchParam(
  params: UseDebouncedSearchParamParams
): UseDebouncedSearchParamResult {
  const searchParams = useSearchParams();
  const { update } = useListingUrl();
  const urlSearchTerm = searchParams.get(params.param) ?? "";

  const [inputValue, setInputValue] = useState<string>(urlSearchTerm);
  const [lastSeenSearchTerm, setLastSeenSearchTerm] =
    useState<string>(urlSearchTerm);
  const [lastRequestedSearchTerm, setLastRequestedSearchTerm] =
    useState<string>(urlSearchTerm);
  const [isDebouncing, setIsDebouncing] = useState<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestedSearchTermRef = useRef<string>(urlSearchTerm);

  // Adjust state while rendering when the URL changed (React's recommended alternative to an effect).
  if (urlSearchTerm !== lastSeenSearchTerm) {
    setLastSeenSearchTerm(urlSearchTerm);
    // Our own request coming back must not overwrite newer typing; external changes (back/forward) must.
    if (urlSearchTerm !== lastRequestedSearchTerm) {
      setInputValue(urlSearchTerm);
      setLastRequestedSearchTerm(urlSearchTerm);
    }
  }

  // External URL change: a pending debounce belongs to the old query, drop it.
  useEffect(() => {
    if (urlSearchTerm === lastRequestedSearchTermRef.current) return;
    lastRequestedSearchTermRef.current = urlSearchTerm;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }, [urlSearchTerm]);

  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    []
  );

  const applySearchTerm = useCallback(
    (raw: string): void => {
      debounceTimerRef.current = null;
      setIsDebouncing(false);
      const searchTerm = raw.trim();
      const navigated = update({
        history: "replace",
        mutate: (query: URLSearchParams) => {
          if (searchTerm) query.set(params.param, searchTerm);
          else query.delete(params.param);
        },
      });
      if (!navigated) return;
      lastRequestedSearchTermRef.current = searchTerm;
      setLastRequestedSearchTerm(searchTerm);
    },
    [params.param, update]
  );

  const setValue = useCallback(
    (next: string): void => {
      setInputValue(next);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (next.trim() === "") {
        applySearchTerm("");
        return;
      }
      setIsDebouncing(true);
      debounceTimerRef.current = setTimeout(
        () => applySearchTerm(next),
        params.delayMs
      );
    },
    [applySearchTerm, params.delayMs]
  );

  const flush = useCallback((): void => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    applySearchTerm(inputValue);
  }, [applySearchTerm, inputValue]);

  return { value: inputValue, setValue, flush, debouncing: isDebouncing };
}
