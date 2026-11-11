import { normalizeHexColor } from '@/lib/hex'
import type { ProductQuery, ProductSort } from '@/types/catalog'

export type SearchParamsRecord = Record<string, string | string[] | undefined>

const SORTS: readonly ProductSort[] = ['featured', 'price_asc', 'price_desc', 'name_asc', 'newest']

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).flatMap((item: string) => item.split(',')).filter(Boolean)
}

function positiveInt(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

/**
 * Parses shareable listing URLs leniently: invalid values are dropped instead of erroring,
 * so a hand-edited URL still renders a sensible page.
 */
export function parseListingParams(params: SearchParamsRecord): ProductQuery {
  const searchRaw = Array.isArray(params.q) ? params.q[0] : params.q
  const sortRaw = Array.isArray(params.rendezes) ? params.rendezes[0] : params.rendezes
  const sort = SORTS.find((item: ProductSort) => item === sortRaw)
  const colors = list(params.szin)
    .map((item: string) => normalizeHexColor(item.startsWith('#') ? item : `#${item}`))
    .filter((item: string | null): item is string => item !== null)
  const storageGb = list(params.tarhely)
    .map(Number)
    .filter((item: number) => Number.isSafeInteger(item) && item > 0)
  const brandRaw = Array.isArray(params.marka) ? params.marka[0] : params.marka
  const categoryRaw = Array.isArray(params.kategoria) ? params.kategoria[0] : params.kategoria

  return {
    search: searchRaw?.trim().slice(0, 100) || undefined,
    brandSlug: brandRaw || undefined,
    categorySlug: categoryRaw || undefined,
    colors: colors.length > 0 ? colors : undefined,
    storageGb: storageGb.length > 0 ? storageGb : undefined,
    minPrice: positiveInt(params.ar_min),
    maxPrice: positiveInt(params.ar_max),
    sort,
    page: Math.max(1, positiveInt(params.oldal) ?? 1),
  }
}

/** Serializes a query back to URL params (inverse of parseListingParams). */
export function listingQueryToParams(query: ProductQuery, omit: ReadonlyArray<'brand' | 'category'> = []): URLSearchParams {
  const params = new URLSearchParams()
  if (query.search) params.set('q', query.search)
  if (query.brandSlug && !omit.includes('brand')) params.set('marka', query.brandSlug)
  if (query.categorySlug && !omit.includes('category')) params.set('kategoria', query.categorySlug)
  if (query.colors?.length) params.set('szin', query.colors.map((hex: string) => hex.slice(1).toLowerCase()).join(','))
  if (query.storageGb?.length) params.set('tarhely', query.storageGb.join(','))
  if (query.minPrice !== undefined) params.set('ar_min', String(query.minPrice))
  if (query.maxPrice !== undefined) params.set('ar_max', String(query.maxPrice))
  if (query.sort && query.sort !== 'featured') params.set('rendezes', query.sort)
  if (query.page && query.page > 1) params.set('oldal', String(query.page))
  return params
}
