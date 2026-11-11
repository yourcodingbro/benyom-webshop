import 'server-only'

import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import { copy, sampleStore } from '@/dto/sample-store'
import type { AuthorizationContext } from '@/types/auth'
import type { Category, Product } from '@/types/catalog'

export type CategoryQuery = {
  /** Only categories that contain listable products of this brand. */
  brandSlug?: string
}

export async function getCategories(query: CategoryQuery = {}): Promise<Category[]> {
  const store = sampleStore()
  let categories = store.categories
  if (query.brandSlug) {
    const brand = store.brands.find((item) => item.slug === query.brandSlug)
    const used = new Set(
      store.products
        .filter((product: Product) => product.brandId === brand?.id && product.status === 'published' && product.orderability !== 'discontinued')
        .flatMap((product: Product) => product.categoryIds),
    )
    categories = categories.filter((category: Category) => used.has(category.id))
  }
  return copy([...categories].sort((a: Category, b: Category) => a.sortOrder - b.sortOrder))
}

/** Most popular categories by the explicit ranking (sample: `popularityRank` in sample.ts; later a Payload field). */
export async function getPopularCategories(limit: number): Promise<Category[]> {
  return copy([...sampleStore().categories].sort((a: Category, b: Category) => a.popularityRank - b.popularityRank).slice(0, limit))
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const category = sampleStore().categories.find((item: Category) => item.slug === slug)
  return category ? copy(category) : null
}

export async function addCategory(input: Omit<Category, 'id'>, auth: AuthorizationContext): Promise<Category> {
  assertAdminOrSystem(auth)
  const store = sampleStore()
  if (store.categories.some((category: Category) => category.slug === input.slug)) throw new AppError('CONFLICT', 'Ez a kategória már létezik.')
  const category: Category = { ...input, id: `cat-${input.slug}` }
  store.categories.push(category)
  return copy(category)
}
