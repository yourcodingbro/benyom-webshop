'use client'

import { CheckIcon, FilterXIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import type React from 'react'

import { ColorDot } from '@/components/product/ColorDot'
import { Button } from '@/components/shadcn/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select'
import { useListingFilters } from '@/hooks/useListingFilters'
import { formatStorage } from '@/lib/catalog'
import { describeColor } from '@/lib/hex'
import { cn } from '@/lib/utils'
import type { Brand, Category, ProductFacets } from '@/types/catalog'

type ListingFiltersProps = {
  /** Keeps element ids unique when the panel is rendered twice (mobile + desktop). */
  idPrefix: string
  /** Listing route the form submits to without JavaScript. */
  action: string
  facets: ProductFacets
  brands: Brand[]
  categories: Category[]
  lockBrand: boolean
  lockCategory: boolean
}

/** Radix Select items cannot use an empty value. */
const ALL: string = 'osszes'

const pillInput: string =
  'h-10 w-full min-w-0 rounded-full border border-input bg-white px-4 text-sm text-ink transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground hover:border-ink focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive'

/**
 * Sidebar filters that apply automatically (no "Apply" button with JavaScript). Price comes
 * first and is debounced; checkboxes and dropdowns apply immediately. Search and sorting are
 * kept and pagination resets (see useListingFilters / useListingUrl).
 */
export function ListingFilters(props: ListingFiltersProps): React.JSX.Element {
  const searchParams = useSearchParams()
  const filters = useListingFilters({ lockBrand: props.lockBrand, lockCategory: props.lockCategory })
  const { state, priceError } = filters
  const id = (name: string): string => `${props.idPrefix}-szures-${name}`
  const search = searchParams.get('q')
  const sort = searchParams.get('rendezes')

  return (
    <div className="space-y-4">
      {/*
        Always rendered so its space is reserved: toggling it never moves the sidebar. When no filter is
        active it is invisible (visibility:hidden removes it from the tab order and the accessibility
        tree), disabled and aria-hidden as well.
      */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('w-full', !filters.hasActiveFilters && 'invisible')}
        onClick={() => {
          filters.clear()
          // The button hides itself; keep keyboard focus inside the panel instead of dropping it to <body>.
          document.getElementById(id('ar-min'))?.focus()
        }}
        disabled={!filters.hasActiveFilters}
        aria-hidden={filters.hasActiveFilters ? undefined : true}
        tabIndex={filters.hasActiveFilters ? undefined : -1}
      >
        <FilterXIcon aria-hidden="true" />
        Szűrők törlése
      </Button>

      <form action={props.action} method="get" className="space-y-6" aria-label="Termékszűrők" onSubmit={(event) => event.preventDefault()}>
        {/* Search and sorting live above the catalog (ProductSearch, ProductSort); keep them for the no-JS submission. */}
        {search ? <input type="hidden" name="q" value={search} /> : null}
        {sort ? <input type="hidden" name="rendezes" value={sort} /> : null}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Ár (Ft)</legend>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={id('ar-min')}>
              Minimum ár (Ft)
            </label>
            <input
              id={id('ar-min')}
              name="ar_min"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={state.minPrice}
              onChange={(event) => filters.setMinPrice(event.target.value)}
              placeholder={props.facets.priceRange ? `${props.facets.priceRange.min}` : 'min.'}
              aria-invalid={priceError?.field === 'min' ? true : undefined}
              aria-describedby={priceError ? id('ar-hiba') : undefined}
              className={pillInput}
            />
            <span aria-hidden="true">–</span>
            <label className="sr-only" htmlFor={id('ar-max')}>
              Maximum ár (Ft)
            </label>
            <input
              id={id('ar-max')}
              name="ar_max"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={state.maxPrice}
              onChange={(event) => filters.setMaxPrice(event.target.value)}
              placeholder={props.facets.priceRange ? `${props.facets.priceRange.max}` : 'max.'}
              aria-invalid={priceError?.field === 'max' ? true : undefined}
              aria-describedby={priceError ? id('ar-hiba') : undefined}
              className={pillInput}
            />
          </div>
          {priceError ? (
            <p id={id('ar-hiba')} className="mt-1.5 text-xs text-destructive" role="alert">
              {priceError.message}
            </p>
          ) : null}
        </fieldset>

        {!props.lockBrand ? (
          <div>
            <label id={id('marka-cimke')} htmlFor={id('marka')} className="mb-1 block text-sm font-semibold">
              Márka
            </label>
            <Select name="marka" value={state.brand || ALL} onValueChange={(value: string) => filters.setBrand(value === ALL ? '' : value)}>
              <SelectTrigger id={id('marka')} aria-labelledby={`${id('marka-cimke')} ${id('marka')}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>Összes márka</SelectItem>
                {props.brands.map((brand: Brand) => (
                  <SelectItem key={brand.id} value={brand.slug}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {!props.lockCategory ? (
          <div>
            <label id={id('kategoria-cimke')} htmlFor={id('kategoria')} className="mb-1 block text-sm font-semibold">
              Kategória
            </label>
            <Select name="kategoria" value={state.category || ALL} onValueChange={(value: string) => filters.setCategory(value === ALL ? '' : value)}>
              <SelectTrigger id={id('kategoria')} aria-labelledby={`${id('kategoria-cimke')} ${id('kategoria')}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>Összes kategória</SelectItem>
                {props.categories.map((category: Category) => (
                  <SelectItem key={category.id} value={category.slug}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {props.facets.colors.length > 0 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Szín</legend>
            <div className="flex flex-wrap gap-2">
              {props.facets.colors.map((color) => {
                const value = color.hex.slice(1).toLowerCase()
                const label = describeColor(color.hex, color.label)
                return (
                  <label key={color.hex} className="relative cursor-pointer" title={label}>
                    <input
                      type="checkbox"
                      name="szin"
                      value={value}
                      checked={state.colors.includes(value)}
                      onChange={() => filters.toggleColor(value)}
                      aria-label={label}
                      className="peer sr-only"
                    />
                    <ColorDot hex={color.hex} size="md" className="peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-2 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
                    <CheckIcon aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto hidden size-4 text-white mix-blend-difference peer-checked:block" />
                  </label>
                )
              })}
            </div>
          </fieldset>
        ) : null}

        {props.facets.storageGb.length > 0 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Tárhely</legend>
            <div className="flex flex-wrap gap-2">
              {props.facets.storageGb.map((storage: number) => {
                const value = String(storage)
                return (
                  <label key={storage} className="cursor-pointer">
                    <input type="checkbox" name="tarhely" value={value} checked={state.storage.includes(value)} onChange={() => filters.toggleStorage(value)} className="peer sr-only" />
                    <span className="inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                      {formatStorage(storage)}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ) : null}

        <noscript>
          <Button type="submit" className="w-full">
            Szűrés
          </Button>
        </noscript>
      </form>
    </div>
  )
}
