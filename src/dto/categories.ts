import 'server-only'

import { toCategory } from '@/dto/catalog-mappers'
import { isUniqueViolation, payloadClient, relationId } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import type { AuthorizationContext } from '@/types/auth'
import type { Category } from '@/types/catalog'

export type CategoryQuery = {
  /** Only categories that contain listable products of this brand. */
  brandSlug?: string
}

export async function getCategories(query: CategoryQuery = {}): Promise<Category[]> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'categories', sort: ['sortOrder', 'name'], pagination: false, depth: 0 })
  let categories = result.docs.map(toCategory)
  if (query.brandSlug) {
    const products = await payload.find({
      collection: 'products',
      where: { and: [{ 'brand.slug': { equals: query.brandSlug } }, { _status: { equals: 'published' } }, { orderability: { not_equals: 'discontinued' } }] },
      pagination: false,
      depth: 0,
      select: { categories: true },
    })
    const used = new Set(products.docs.flatMap((product) => (product.categories ?? []).map((category) => relationId(category) ?? '')))
    categories = categories.filter((category: Category) => used.has(category.id))
  }
  return categories
}

/** Most popular categories by the explicit editorial ranking (`popularityRank`). */
export async function getPopularCategories(limit: number): Promise<Category[]> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'categories', sort: ['popularityRank', 'name'], limit, depth: 0 })
  return result.docs.map(toCategory)
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'categories', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  const doc = result.docs[0]
  return doc ? toCategory(doc) : null
}

export async function addCategory(input: Omit<Category, 'id'> & { id?: string }, auth: AuthorizationContext): Promise<Category> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  try {
    const doc = await payload.create({ collection: 'categories', data: { ...input, id: input.id ?? `cat-${input.slug}` }, overrideAccess: true })
    return toCategory(doc)
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Ez a kategória már létezik.')
    throw error
  }
}
