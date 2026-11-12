'use client'

import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import type React from 'react'
import { useId } from 'react'

import { Button } from '@/components/shadcn/button'
import { SEARCH_DEBOUNCE_MS } from '@/config/shop'
import { useDebouncedSearchParam } from '@/hooks/useDebouncedSearchParam'
import { useListingTransition } from '@/hooks/useListingTransition'

type ProductSearchProps = {
  /** Listing route the form submits to without JavaScript. */
  action: string
  /** Other active listing params (filters, sort) as [name, value] pairs, kept by the no-JS submission. */
  preservedParams: [string, string][]
}

const SEARCH_PARAM: string = 'q'

/**
 * Full-width pill search field. With JavaScript it applies ~300 ms after typing stops
 * (useDebouncedSearchParam owns the input state and the URL sync); without it, it is a GET form.
 */
export function ProductSearch(props: ProductSearchProps): React.JSX.Element {
  const id = useId()
  const { isPending } = useListingTransition()
  const search = useDebouncedSearchParam({ param: SEARCH_PARAM, delayMs: SEARCH_DEBOUNCE_MS })
  const busy = isPending || search.debouncing

  return (
    <form
      action={props.action}
      method="get"
      role="search"
      aria-label="Termékkeresés"
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault()
        search.flush()
      }}
    >
      {props.preservedParams.map(([name, value]) => (
        <input key={`${name}=${value}`} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor={`${id}-kereses`} className="sr-only">
        Keresés a termékek között
      </label>
      <div className="relative w-full">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={`${id}-kereses`}
          name={SEARCH_PARAM}
          type="search"
          value={search.value}
          onChange={(event) => search.setValue(event.target.value)}
          placeholder="Keresés név, márka, modell vagy cikkszám alapján"
          autoComplete="off"
          maxLength={100}
          aria-describedby={`${id}-kereses-allapot`}
          className="h-11 w-full min-w-0 rounded-full border border-input bg-white pr-11 pl-11 text-sm text-ink transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground hover:border-ink focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {busy ? (
          <Loader2Icon className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
        ) : search.value ? (
          <Button type="button" variant="ghost" size="icon-sm" className="absolute top-1/2 right-1 -translate-y-1/2" aria-label="Keresés törlése" onClick={() => search.setValue('')}>
            <XIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <span id={`${id}-kereses-allapot`} className="sr-only" aria-live="polite">
        {busy ? 'Keresés folyamatban…' : ''}
      </span>
    </form>
  )
}
