import type { CollectionConfig } from 'payload'

import { serverOnly } from '@/collections/access'

/**
 * Former product slugs. `/termek/<old>` redirects (308) straight to the product's current slug, so
 * there are no chains; the unique index keeps one owner per historical slug, and a historical slug
 * cannot be taken by another product. Written only by the Products hooks.
 */
export const ProductSlugHistory: CollectionConfig = {
  slug: 'product-slug-history',
  labels: { singular: 'Korábbi termék-URL', plural: 'Korábbi termék-URL-ek' },
  admin: { hidden: true },
  access: { read: serverOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    // Not required: deleting the product nulls the reference, and the old URL then simply 404s.
    { name: 'product', type: 'relationship', relationTo: 'products', index: true },
  ],
}
