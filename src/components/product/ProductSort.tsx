'use client'

import { ArrowUpDownIcon } from 'lucide-react'
import type React from 'react'
import { useId } from 'react'

import { Button } from '@/components/shadcn/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select'
import { SORT_LABELS } from '@/config/labels'
import { DEFAULT_PRODUCT_SORT } from '@/config/shop'
import { useListingUrl } from '@/hooks/useListingUrl'
import type { ProductSort as ProductSortValue } from '@/types/catalog'

type ProductSortProps = {
  /** Listing route the form submits to without JavaScript. */
  action: string
  /** Active sort from the URL (the default "Kiemelt" when none). */
  sort: ProductSortValue
  /** Other active listing params (search, filters) as [name, value] pairs, kept by the no-JS submission. */
  preservedParams: [string, string][]
}

const SORT_PARAM: string = 'rendezes'

/** Right-aligned pill sort dropdown. Applies on selection through useListingUrl (page reset, other params kept). */
export function ProductSort(props: ProductSortProps): React.JSX.Element {
  const id = useId()
  const { update } = useListingUrl()

  const changeSort = (sort: string): void => {
    // An explicit sort choice is a history entry (unlike search keystrokes).
    update({
      history: 'push',
      mutate: (query: URLSearchParams) => {
        if (sort === DEFAULT_PRODUCT_SORT) query.delete(SORT_PARAM)
        else query.set(SORT_PARAM, sort)
      },
    })
  }

  return (
    <form action={props.action} method="get" aria-label="Rendezés" className="flex w-full items-center justify-end gap-2" onSubmit={(event) => event.preventDefault()}>
      {props.preservedParams.map(([name, value]) => (
        <input key={`${name}=${value}`} type="hidden" name={name} value={value} />
      ))}
      <label id={`${id}-rendezes-cimke`} htmlFor={`${id}-rendezes`} className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap">
        <ArrowUpDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        Rendezés
      </label>
      {/* key: re-syncs the uncontrolled value when the URL changes from outside (Back/Forward). */}
      <Select key={props.sort} name={SORT_PARAM} defaultValue={props.sort} onValueChange={changeSort}>
        <SelectTrigger id={`${id}-rendezes`} aria-labelledby={`${id}-rendezes-cimke ${id}-rendezes`} className="w-56 max-w-[60%]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {(Object.keys(SORT_LABELS) as ProductSortValue[]).map((sort: ProductSortValue) => (
            <SelectItem key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <noscript>
        <Button type="submit" variant="outline" size="sm">
          Alkalmaz
        </Button>
      </noscript>
    </form>
  )
}
