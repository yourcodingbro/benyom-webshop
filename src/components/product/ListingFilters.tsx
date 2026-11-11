import { CheckIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { ColorSwatch } from '@/components/product/ColorSwatch'
import { Button } from '@/components/shadcn/button'
import { SORT_LABELS } from '@/config/labels'
import { formatStorage } from '@/lib/catalog'
import { describeColor } from '@/lib/hex'
import type { Brand, Category, ProductFacets, ProductQuery, ProductSort } from '@/types/catalog'

type ListingFiltersProps = {
  /** Keeps element ids unique when the form is rendered twice (mobile + desktop). */
  idPrefix: string
  action: string
  query: ProductQuery
  facets: ProductFacets
  brands: Brand[]
  categories: Category[]
  lockBrand: boolean
  lockCategory: boolean
}

const fieldClass = 'h-10 w-full rounded-md border border-input bg-white px-3 text-sm'

/** Native GET form: filtering works without JavaScript and every state is a shareable URL. */
export function ListingFilters(props: ListingFiltersProps): React.JSX.Element {
  const { query, facets } = props
  return (
    <form action={props.action} method="get" className="space-y-6" aria-label="Termékszűrők">
      <div>
        <label htmlFor={`${props.idPrefix}-szures-kereses`} className="mb-1 block text-sm font-semibold">
          Keresés
        </label>
        <input id={`${props.idPrefix}-szures-kereses`} name="q" type="search" defaultValue={query.search} placeholder="Név, modell, cikkszám" className={fieldClass} />
      </div>
      {!props.lockBrand ? (
        <div>
          <label htmlFor={`${props.idPrefix}-szures-marka`} className="mb-1 block text-sm font-semibold">
            Márka
          </label>
          <select id={`${props.idPrefix}-szures-marka`} name="marka" defaultValue={query.brandSlug ?? ''} className={fieldClass}>
            <option value="">Összes márka</option>
            {props.brands.map((brand: Brand) => (
              <option key={brand.id} value={brand.slug}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {!props.lockCategory ? (
        <div>
          <label htmlFor={`${props.idPrefix}-szures-kategoria`} className="mb-1 block text-sm font-semibold">
            Kategória
          </label>
          <select id={`${props.idPrefix}-szures-kategoria`} name="kategoria" defaultValue={query.categorySlug ?? ''} className={fieldClass}>
            <option value="">Összes kategória</option>
            {props.categories.map((category: Category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {facets.colors.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Szín</legend>
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((color) => {
              const value = color.hex.slice(1).toLowerCase()
              const label = describeColor(color.hex, color.label)
              return (
                <label key={color.hex} className="relative cursor-pointer" title={label}>
                  <input type="checkbox" name="szin" value={value} defaultChecked={query.colors?.includes(color.hex)} aria-label={label} className="peer sr-only" />
                  <ColorSwatch hex={color.hex} size="md" className="peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-2 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
                  <CheckIcon aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto hidden size-4 text-white mix-blend-difference peer-checked:block" />
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}
      {facets.storageGb.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Tárhely</legend>
          <div className="flex flex-wrap gap-2">
            {facets.storageGb.map((storage: number) => (
              <label key={storage} className="cursor-pointer">
                <input type="checkbox" name="tarhely" value={storage} defaultChecked={query.storageGb?.includes(storage)} className="peer sr-only" />
                <span className="inline-block rounded-full border px-3 py-1.5 text-sm peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                  {formatStorage(storage)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Ár (Ft)</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${props.idPrefix}-szures-ar-min`}>
            Minimum ár
          </label>
          <input id={`${props.idPrefix}-szures-ar-min`} name="ar_min" type="number" min={0} step={1000} inputMode="numeric" defaultValue={query.minPrice} placeholder={facets.priceRange ? String(facets.priceRange.min) : 'min.'} className={fieldClass} />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor={`${props.idPrefix}-szures-ar-max`}>
            Maximum ár
          </label>
          <input id={`${props.idPrefix}-szures-ar-max`} name="ar_max" type="number" min={0} step={1000} inputMode="numeric" defaultValue={query.maxPrice} placeholder={facets.priceRange ? String(facets.priceRange.max) : 'max.'} className={fieldClass} />
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${props.idPrefix}-szures-rendezes`} className="mb-1 block text-sm font-semibold">
          Rendezés
        </label>
        <select id={`${props.idPrefix}-szures-rendezes`} name="rendezes" defaultValue={query.sort ?? 'featured'} className={fieldClass}>
          {(Object.keys(SORT_LABELS) as ProductSort[]).map((sort: ProductSort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          <SlidersHorizontalIcon aria-hidden="true" />
          Szűrés
        </Button>
        <Button asChild variant="outline">
          <Link href={props.action}>
            <XIcon aria-hidden="true" />
            Törlés
          </Link>
        </Button>
      </div>
    </form>
  )
}
