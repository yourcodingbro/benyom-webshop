import 'server-only'

import { DEFAULT_PRODUCT_SORT } from '@/config/shop'
import { assertAdminOrSystem } from '@/lib/authorization'
import { priceRange, searchKey } from '@/lib/catalog'
import { clock } from '@/lib/clock'
import { AppError } from '@/lib/errors'
import { copy, sampleStore } from '@/dto/sample-store'
import type { AuthorizationContext } from '@/types/auth'
import type {
  Brand,
  Product,
  ProductFacets,
  ProductInput,
  ProductListResult,
  ProductQuery,
  ProductSort,
  ProductUpdate,
  ProductVariant,
  VariantLookup,
} from '@/types/catalog'

/*
 * Product data access. Today: sample runtime store.
 * Later: `payload.find({ collection: 'products', where, sort, page, limit })` with the
 * response normalized to the same `Product` type inside this file.
 */

function isListable(product: Product): boolean {
  return product.status === 'published' && product.orderability !== 'discontinued'
}

function matchesSearch(product: Product, brand: Brand | undefined, search: string): boolean {
  const haystack = searchKey(
    [product.name, product.model, brand?.name ?? '', ...product.variants.map((variant: ProductVariant) => variant.sku)].join(' '),
  )
  return searchKey(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((token: string) => haystack.includes(token))
}

function variantMatches(variant: ProductVariant, query: ProductQuery): boolean {
  if (query.colors?.length && (!variant.attributes.colorHex || !query.colors.includes(variant.attributes.colorHex))) return false
  if (query.storageGb?.length && (variant.attributes.storageGb === null || !query.storageGb.includes(variant.attributes.storageGb))) return false
  if (query.minPrice !== undefined && variant.price < query.minPrice) return false
  if (query.maxPrice !== undefined && variant.price > query.maxPrice) return false
  return true
}

function buildFacets(products: Product[]): ProductFacets {
  const colors = new Map<string, string | null>()
  const storage = new Set<number>()
  const prices: number[] = []
  for (const product of products) {
    for (const variant of product.variants) {
      const { colorHex, colorLabel, storageGb } = variant.attributes
      if (colorHex && !colors.get(colorHex)) colors.set(colorHex, colorLabel)
      if (storageGb !== null) storage.add(storageGb)
      prices.push(variant.price)
    }
  }
  return {
    colors: [...colors].map(([hex, label]) => ({ hex, label })),
    storageGb: [...storage].sort((a: number, b: number) => a - b),
    priceRange: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
  }
}

const collator: Intl.Collator = new Intl.Collator('hu-HU')

/**
 * Every order ends with name, then id, as tie-breakers, so equal keys never swap between
 * requests and pagination stays stable.
 */
function sortProducts(products: Product[], sort: ProductSort): Product[] {
  const minPrice = (product: Product): number => priceRange(product)?.min ?? 0
  const tieBreak = (a: Product, b: Product): number => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const primary: Record<ProductSort, (a: Product, b: Product) => number> = {
    featured: (a: Product, b: Product) => Number(b.featured) - Number(a.featured),
    price_asc: (a: Product, b: Product) => minPrice(a) - minPrice(b),
    price_desc: (a: Product, b: Product) => minPrice(b) - minPrice(a),
    name_asc: () => 0,
    newest: (a: Product, b: Product) => b.createdAt.localeCompare(a.createdAt),
  }
  return [...products].sort((a: Product, b: Product) => primary[sort](a, b) || tieBreak(a, b))
}

/** Upper bound for one page; also used when a caller passes no pageSize. Page sizes are chosen by callers. */
const MAX_PRODUCT_PAGE_SIZE: number = 48

/**
 * Listable products matching the route and search part of the query (before the color, storage
 * and price filters), or null when the brand/category slug does not exist.
 */
function baseProducts(query: ProductQuery): Product[] | null {
  const store = sampleStore()
  const brandsById = new Map(store.brands.map((brand: Brand) => [brand.id, brand]))
  const brand = query.brandSlug ? store.brands.find((item: Brand) => item.slug === query.brandSlug) : undefined
  const category = query.categorySlug ? store.categories.find((item) => item.slug === query.categorySlug) : undefined
  if ((query.brandSlug && !brand) || (query.categorySlug && !category)) return null
  return store.products.filter(
    (product: Product) =>
      isListable(product) &&
      (!brand || product.brandId === brand.id) &&
      (!category || product.categoryIds.includes(category.id)) &&
      (!query.featuredOnly || product.featured) &&
      (!query.search || matchesSearch(product, brandsById.get(product.brandId), query.search)),
  )
}

/** Published, non-discontinued products matching the query, one page of them, with facets for the filter UI. */
export async function getProducts(query: ProductQuery = {}): Promise<ProductListResult> {
  const pageSize = Math.min(Math.max(query.pageSize ?? MAX_PRODUCT_PAGE_SIZE, 1), MAX_PRODUCT_PAGE_SIZE)
  const base = baseProducts(query)
  if (!base) return { items: [], page: 1, pageSize, totalItems: 0, totalPages: 0, facets: buildFacets([]) }

  const filtered = base.filter((product: Product) => product.variants.some((variant: ProductVariant) => variantMatches(variant, query)))
  // The default ("Kiemelt") is applied here too, so every caller gets the same order, not only the UI.
  const sorted = sortProducts(filtered, query.sort ?? DEFAULT_PRODUCT_SORT)
  const totalPages = Math.ceil(sorted.length / pageSize)
  const page = Math.min(Math.max(query.page ?? 1, 1), Math.max(totalPages, 1))

  return {
    items: copy(sorted.slice((page - 1) * pageSize, page * pageSize)),
    page,
    pageSize,
    totalItems: sorted.length,
    totalPages,
    facets: buildFacets(base),
  }
}

/** Filter options for a listing (same as getProducts(query).facets, without paging or sorting). */
export async function getProductFacets(query: ProductQuery): Promise<ProductFacets> {
  return buildFacets(baseProducts(query) ?? [])
}

/** Published product by slug (discontinued products stay reachable for old links). */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const product = sampleStore().products.find((item: Product) => item.slug === slug && item.status === 'published')
  return product ? copy(product) : null
}

/** Any product, including drafts. Admin/system only. */
export async function getProductById(id: string, auth: AuthorizationContext): Promise<Product | null> {
  assertAdminOrSystem(auth)
  const product = sampleStore().products.find((item: Product) => item.id === id)
  return product ? copy(product) : null
}

/** Resolves SKUs to published products and their variants (unknown SKUs are omitted). */
export async function getVariantsBySku(skus: string[]): Promise<VariantLookup[]> {
  const store = sampleStore()
  const results: VariantLookup[] = []
  for (const sku of new Set(skus)) {
    for (const product of store.products) {
      if (product.status !== 'published') continue
      const variant = product.variants.find((item: ProductVariant) => item.sku === sku)
      const brand = store.brands.find((item: Brand) => item.id === product.brandId)
      if (variant && brand) results.push(copy({ product, variant, brand }))
    }
  }
  return results
}

/** Every product in any status. Admin/system only (CSV import planning, admin lists). */
export async function getAllProducts(auth: AuthorizationContext): Promise<Product[]> {
  assertAdminOrSystem(auth)
  return copy(sampleStore().products)
}

export async function getProductSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
  return sampleStore()
    .products.filter(isListable)
    .map((product: Product) => ({ slug: product.slug, updatedAt: product.updatedAt }))
}

function assertUniqueSkus(products: Product[]): void {
  const seen = new Set<string>()
  for (const product of products) {
    for (const variant of product.variants) {
      if (seen.has(variant.sku)) throw new AppError('CONFLICT', `A(z) ${variant.sku} cikkszám már létezik.`)
      seen.add(variant.sku)
    }
  }
}

export async function addProduct(input: ProductInput, auth: AuthorizationContext): Promise<Product> {
  assertAdminOrSystem(auth)
  const store = sampleStore()
  const id = input.id ?? `prod-${input.slug}`
  if (store.products.some((product: Product) => product.id === id || product.slug === input.slug)) {
    throw new AppError('CONFLICT', 'Már létezik termék ezzel az azonosítóval vagy slug-gal.')
  }
  const now = clock.nowIso()
  const product: Product = { ...copy(input), id, createdAt: now, updatedAt: now }
  assertUniqueSkus([...store.products, product])
  store.products.push(product)
  return copy(product)
}

/** Partial update: omitted fields keep their stored value. */
export async function updateProduct(id: string, input: ProductUpdate, auth: AuthorizationContext): Promise<Product> {
  assertAdminOrSystem(auth)
  const store = sampleStore()
  const index = store.products.findIndex((product: Product) => product.id === id)
  const current = store.products[index]
  if (!current) throw new AppError('NOT_FOUND', 'A termék nem található.')
  const next: Product = { ...current, ...copy(input), id, createdAt: current.createdAt, updatedAt: clock.nowIso() }
  if (store.products.some((product: Product) => product.id !== id && product.slug === next.slug)) {
    throw new AppError('CONFLICT', 'Már létezik termék ezzel a slug-gal.')
  }
  assertUniqueSkus(store.products.map((product: Product) => (product.id === id ? next : product)))
  store.products[index] = next
  return copy(next)
}

/** Removes a product from the catalog. Existing orders keep their own snapshots. */
export async function deleteProduct(id: string, auth: AuthorizationContext): Promise<void> {
  assertAdminOrSystem(auth)
  const store = sampleStore()
  const before = store.products.length
  store.products = store.products.filter((product: Product) => product.id !== id)
  if (store.products.length === before) throw new AppError('NOT_FOUND', 'A termék nem található.')
}
