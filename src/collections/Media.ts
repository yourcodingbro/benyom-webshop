import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'

import { adminOnly, publicRead } from '@/collections/access'
import { hexColorField } from '@/collections/fields'

/** Media referenced by any product (or variant) can never be deleted. */
const preventReferencedDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const referenced = await req.payload.count({
    collection: 'products',
    where: { or: [{ images: { contains: id } }, { 'variants.images': { contains: id } }] },
    req,
    overrideAccess: true,
  })
  if (referenced.totalDocs > 0) throw new APIError('A médiafájlt termék használja, ezért nem törölhető.', 409)
}

/**
 * Product media. `objectKey` is the explicit Supabase Storage key
 * (brand/category/product/[color]/filename) and is stored, never inferred.
 * No storage adapter is configured yet (see docs/deployment.md).
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Média', plural: 'Médiatár' },
  admin: { useAsTitle: 'alt', group: 'Katalógus', defaultColumns: ['filename', 'alt', 'objectKey'] },
  access: { read: publicRead, create: adminOnly, update: adminOnly, delete: adminOnly },
  upload: {
    mimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'image/avif'],
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 400, position: 'centre' },
      { name: 'card', width: 800, height: 800, position: 'centre' },
    ],
  },
  fields: [
    { name: 'alt', label: 'Alternatív szöveg', type: 'text', required: true },
    { name: 'objectKey', label: 'Tárolási kulcs', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'Pl. apple/mobiltelefon/iphone-17/000000/elolnezet-a1b2.webp' } },
    hexColorField('colorHex', 'Megjelenített szín (HEX)'),
  ],
  hooks: { beforeDelete: [preventReferencedDelete] },
}
