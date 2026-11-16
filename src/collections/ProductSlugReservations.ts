import type { CollectionConfig } from 'payload'

import { serverOnly } from '@/collections/utils/access'

/**
 * Product slugs held by product forms that are not saved yet (an image was uploaded before the first
 * save, so its storage path already uses the slug). The unique index makes reservations race-free;
 * a reservation is released when the product is created and expires otherwise. Server-only.
 */
export const ProductSlugReservations: CollectionConfig = {
  slug: 'product-slug-reservations',
  labels: { singular: 'Slug-foglalás', plural: 'Slug-foglalások' },
  admin: { hidden: true },
  access: { read: serverOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}
