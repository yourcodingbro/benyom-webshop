import { randomUUID } from 'node:crypto'

import type { CollectionBeforeValidateHook } from 'payload'

import { freeSlug } from '@/collections/utils/slugs'
import { slugify } from '@/lib/slug'

/** Brands and categories: slug from the name, id from the slug, both only when left empty on creation. */
export function autoSlugAndId(collection: 'brands' | 'categories', idPrefix: string): CollectionBeforeValidateHook {
  return async ({ data, operation, req }) => {
    if (!data) return data
    if (typeof data.slug === 'string' && data.slug) data.slug = slugify(data.slug)
    if (operation !== 'create') return data
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    const slug = typeof data.slug === 'string' && data.slug ? data.slug : name ? await freeSlug(req.payload, collection, name, req) : data.slug
    let id = data.id
    if (!id && typeof slug === 'string' && slug) {
      const candidate = `${idPrefix}-${slug}`.slice(0, 80)
      const clash = await req.payload.count({ collection, where: { id: { equals: candidate } }, overrideAccess: true, req })
      id = clash.totalDocs > 0 ? `${idPrefix}-${randomUUID()}` : candidate
    }
    return { ...data, slug, id }
  }
}
