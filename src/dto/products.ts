import 'server-only'

import { DEFAULT_PRODUCT_SORT } from '@/config/shop'
import { toBrand, toCategory, toProduct, toProductData } from '@/dto/catalog-mappers'
import { isUniqueViolation, payloadClient } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import type { Product as ProductDoc } from '@/payload-types'
import { priceRange, searchKey } from '@/lib/catalog'
import { AppError } from '@/lib/errors'
import type { AuthorizationContext } from '@/types/auth'
import type {
  Brand,
  Category,
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
 * Product data access through Payload's Local API (Supabase PostgreSQL). Public reads use public
 * access rules (`overrideAccess: false`), so drafts never reach the storefront. Listing, facets and
 * pagination share one rule set below.
 * shortcut: a listing request loads every listable product and filters/sorts in memory; move the
 * filters into Payload `where` clauses when the catalog grows beyond a few thousand products.
 */

type Catalog = { brands: Brand[]; categories: Category[]; products: Product[] }

async function listableCatalog(): Promise<Catalog> {
  const payload = await payloadClient()
  const [brands, categories, products] = await Promise.all([
    payload.find({ collection: 'brands', pagination: false, depth: 0 }),
    payload.find({ collection: 'categories', pagination: false, depth: 0 }),
    payload.find({
      collection: 'products',
      where: { and: [{ _status: { equals: 'published' } }, { orderability: { not_equals: 'discontinued' } }] },
      pagination: false,
      depth: 1,
      overrideAccess: false,
    }),
  ])
  return { brands: brands.docs.map(toBrand), categories: categories.docs.map(toCategory), products: products.docs.map(toProduct) }
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

/** Every order ends with name, then id, as tie-breakers, so pagination stays stable. */
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
function baseProducts(catalog: Catalog, query: ProductQuery): Product[] | null {
  const brandsById = new Map(catalog.brands.map((brand: Brand) => [brand.id, brand]))
  const brand = query.brandSlug ? catalog.brands.find((item: Brand) => item.slug === query.brandSlug) : undefined
  const category = query.categorySlug ? catalog.categories.find((item: Category) => item.slug === query.categorySlug) : undefined
  if ((query.brandSlug && !brand) || (query.categorySlug && !category)) return null
  return catalog.products.filter(
    (product: Product) =>
      (!brand || product.brandId === brand.id) &&
      (!category || product.categoryIds.includes(category.id)) &&
      (!query.featuredOnly || product.featured) &&
      (!query.search || matchesSearch(product, brandsById.get(product.brandId), query.search)),
  )
}

/** Published, non-discontinued products matching the query, one page of them, with facets for the filter UI. */
export async function getProducts(query: ProductQuery = {}): Promise<ProductListResult> {
  const pageSize = Math.min(Math.max(query.pageSize ?? MAX_PRODUCT_PAGE_SIZE, 1), MAX_PRODUCT_PAGE_SIZE)
  const base = baseProducts(await listableCatalog(), query)
  if (!base) return { items: [], page: 1, pageSize, totalItems: 0, totalPages: 0, facets: buildFacets([]) }

  const filtered = base.filter((product: Product) => product.variants.some((variant: ProductVariant) => variantMatches(variant, query)))
  // The default ("Kiemelt") is applied here too, so every caller gets the same order, not only the UI.
  const sorted = sortProducts(filtered, query.sort ?? DEFAULT_PRODUCT_SORT)
  const totalPages = Math.ceil(sorted.length / pageSize)
  const page = Math.min(Math.max(query.page ?? 1, 1), Math.max(totalPages, 1))

  return {
    items: sorted.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalItems: sorted.length,
    totalPages,
    facets: buildFacets(base),
  }
}

/** Filter options for a listing (same as getProducts(query).facets, without paging or sorting). */
export async function getProductFacets(query: ProductQuery): Promise<ProductFacets> {
  return buildFacets(baseProducts(await listableCatalog(), query) ?? [])
}

/** Published product by slug (discontinued products stay reachable for old links). */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'products', where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] }, limit: 1, depth: 1, overrideAccess: false })
  const doc = result.docs[0]
  return doc ? toProduct(doc) : null
}

/** Any product, including drafts. Admin/system only. */
export async function getProductById(id: string, auth: AuthorizationContext): Promise<Product | null> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'products', where: { id: { equals: id } }, limit: 1, depth: 1, draft: true, overrideAccess: true })
  const doc = result.docs[0]
  return doc ? toProduct(doc) : null
}

/** Resolves SKUs to published products and their variants (unknown SKUs are omitted). */
export async function getVariantsBySku(skus: string[]): Promise<VariantLookup[]> {
  const unique = [...new Set(skus)]
  if (unique.length === 0) return []
  const payload = await payloadClient()
  const result = await payload.find({
    collection: 'products',
    where: { and: [{ 'variants.sku': { in: unique } }, { _status: { equals: 'published' } }] },
    pagination: false,
    depth: 1,
    overrideAccess: false,
  })
  const products = result.docs.map(toProduct)
  const brandIds = [...new Set(products.map((product: Product) => product.brandId))]
  const brands = brandIds.length > 0 ? (await payload.find({ collection: 'brands', where: { id: { in: brandIds } }, pagination: false, depth: 0 })).docs.map(toBrand) : []
  const results: VariantLookup[] = []
  for (const sku of unique) {
    for (const product of products) {
      const variant = product.variants.find((item: ProductVariant) => item.sku === sku)
      const brand = brands.find((item: Brand) => item.id === product.brandId)
      if (variant && brand) results.push({ product, variant, brand })
    }
  }
  return results
}

/** Every product in any status (drafts included). Admin/system only (CSV import planning, admin lists). */
export async function getAllProducts(auth: AuthorizationContext): Promise<Product[]> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'products', pagination: false, depth: 1, draft: true, overrideAccess: true })
  return result.docs.map(toProduct)
}

export async function getProductSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
  const payload = await payloadClient()
  const result = await payload.find({
    collection: 'products',
    where: { and: [{ _status: { equals: 'published' } }, { orderability: { not_equals: 'discontinued' } }] },
    pagination: false,
    depth: 0,
    overrideAccess: false,
  })
  return result.docs.map((doc) => ({ slug: doc.slug, updatedAt: doc.updatedAt }))
}

/** Payload validation errors (status 400/409) become actionable AppErrors; anything else is rethrown. */
function toAppError(error: unknown): AppError | null {
  if (isUniqueViolation(error)) return new AppError('CONFLICT', 'Már létezik termék ezzel az azonosítóval, slug-gal vagy cikkszámmal.')
  const status = error instanceof Error && 'status' in error ? (error as { status: unknown }).status : null
  if (status === 409 && error instanceof Error) return new AppError('CONFLICT', error.message)
  if (status === 400 && error instanceof Error) return new AppError('VALIDATION', error.message)
  return null
}

/** Creates through Payload, so the admin form, the CSV import and the API share one rule set (SKU, HEX, slug). */
export async function addProduct(input: ProductInput, auth: AuthorizationContext): Promise<Product> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const data = { ...toProductData(input), id: input.id ?? `prod-${input.slug}` }
  try {
    const doc = await payload.create({ collection: 'products', data: data as ProductDoc, draft: input.status === 'draft', overrideAccess: true, depth: 1 })
    return toProduct(doc)
  } catch (error: unknown) {
    throw toAppError(error) ?? error
  }
}

/** Partial update: omitted fields keep their stored value. */
export async function updateProduct(id: string, input: ProductUpdate, auth: AuthorizationContext): Promise<Product> {
  assertAdminOrSystem(auth)
  const current = await getProductById(id, auth)
  if (!current) throw new AppError('NOT_FOUND', 'A termék nem található.')
  const payload = await payloadClient()
  try {
    const doc = await payload.update({ collection: 'products', id, data: toProductData(input), draft: (input.status ?? current.status) === 'draft', overrideAccess: true, depth: 1 })
    return toProduct(doc)
  } catch (error: unknown) {
    throw toAppError(error) ?? error
  }
}

/** Removes a product from the catalog. Existing orders keep their own snapshots. */
export async function deleteProduct(id: string, auth: AuthorizationContext): Promise<void> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.delete({ collection: 'products', where: { id: { equals: id } }, overrideAccess: true })
  if (result.docs.length === 0) throw new AppError('NOT_FOUND', 'A termék nem található.')
}
