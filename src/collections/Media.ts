import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { adminOnly, publicRead } from '@/collections/access'
import { hexColorField, SLUG_PATTERN } from '@/collections/fields'
import { getServerEnv, getStorageEnv } from '@/config/env'
import { hexToPathSegment, normalizeHexColor } from '@/lib/hex'

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

/** Uploads need Supabase Storage; there is no silent local-disk fallback. */
const requireStorage: CollectionBeforeValidateHook = ({ data, req }) => {
  if (req.file && !getStorageEnv(getServerEnv())) {
    throw new APIError('A médiatár nincs beállítva (SUPABASE_* környezeti változók). Feltöltés nem lehetséges.', 503)
  }
  return data
}

/**
 * The storage object key is brand/category/product/[color]/filename. It is set explicitly from the
 * document's own fields (never parsed back into relations) and saved as `objectKey`; the S3 adapter
 * uploads under the per-document `prefix`.
 */
const setObjectKey: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const brand = String(data.brandSlug ?? originalDoc?.brandSlug ?? '')
  const category = String(data.categorySlug ?? originalDoc?.categorySlug ?? '')
  const product = String(data.productSlug ?? originalDoc?.productSlug ?? '')
  const filename = String(data.filename ?? originalDoc?.filename ?? '')
  const hex = typeof (data.colorHex ?? originalDoc?.colorHex) === 'string' ? normalizeHexColor(String(data.colorHex ?? originalDoc?.colorHex)) : null
  const prefix = [brand, category, product, ...(hex ? [hexToPathSegment(hex)] : [])].join('/')
  if (originalDoc?.objectKey && originalDoc.prefix && originalDoc.prefix !== prefix) {
    throw new APIError('A tárolási útvonal feltöltés után nem módosítható; töltse fel újra a képet.', 400)
  }
  return { ...data, prefix, objectKey: filename ? `${prefix}/${filename}` : (originalDoc?.objectKey ?? null) }
}

const slugText = (name: string, label: string) =>
  ({
    name,
    label,
    type: 'text',
    required: true,
    validate: (value: string | null | undefined) => (value && SLUG_PATTERN.test(value) ? true : 'Slug formátum: kisbetű, szám, kötőjel.'),
  }) as const

/** Product media in Supabase Storage (public bucket). */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Média', plural: 'Médiatár' },
  admin: { useAsTitle: 'alt', group: 'Katalógus', defaultColumns: ['filename', 'alt', 'objectKey'] },
  access: { read: publicRead, create: adminOnly, update: adminOnly, delete: adminOnly },
  upload: {
    // Every file lives under its own brand/category/product/[color] prefix, so the same filename may repeat
    // (e.g. elolnezet.webp); uniqueness is per prefix instead of collection-wide.
    filenameCompoundIndex: ['filename', 'prefix'],
    mimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'image/avif'],
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 400, position: 'centre' },
      { name: 'card', width: 800, height: 800, position: 'centre' },
    ],
  },
  fields: [
    { name: 'alt', label: 'Alternatív szöveg', type: 'text', required: true },
    slugText('brandSlug', 'Márka (slug)'),
    slugText('categorySlug', 'Kategória (slug)'),
    slugText('productSlug', 'Termék (slug)'),
    hexColorField('colorHex', 'Megjelenített szín (HEX)'),
    { name: 'objectKey', label: 'Tárolási kulcs', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'márka/kategória/termék/[szín]/fájlnév' } },
    // Storage-adapter fields, declared here as well so the database schema is identical with or without
    // SUPABASE_* configured; the S3 plugin replaces them with its own definitions of the same name and type.
    { name: 'prefix', type: 'text', defaultValue: '', admin: { hidden: true, readOnly: true } },
    { name: '_objectKey', type: 'text', admin: { hidden: true, readOnly: true } },
  ],
  hooks: { beforeValidate: [requireStorage], beforeChange: [setObjectKey], beforeDelete: [preventReferencedDelete] },
}
