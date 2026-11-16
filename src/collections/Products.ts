import { randomUUID } from 'node:crypto'

import { APIError, type CollectionAfterChangeHook, type CollectionBeforeValidateHook, type CollectionConfig, type Field, type FilterOptions, type PayloadRequest, ValidationError } from 'payload'

import { adminOnly, publishedOrAdmin } from '@/collections/access'
import { isReservedProductSlug, reserveProductSlug } from '@/collections/hooks/slugs'
import { hexColorField, hufField, ORDERABILITY_OPTIONS, procurementGroup, SKU_PATTERN, slugField, stableIdField } from '@/collections/fields'
import { clock } from '@/lib/clock'
import { slugify } from '@/lib/slug'

type VariantRow = { sku?: string | null }

/**
 * SKUs are normalized to upper case and must be unique within a product and across all products
 * (array fields cannot carry a global unique index). Applies to the admin form, the API and the
 * CSV import alike, since all of them write through Payload.
 */
const enforceUniqueSkus: CollectionBeforeValidateHook = async ({ data, req, originalDoc }) => {
  if (!data) return data
  const variants: VariantRow[] = Array.isArray(data.variants) ? data.variants : []
  for (const variant of variants) if (typeof variant.sku === 'string') variant.sku = variant.sku.trim().toUpperCase()
  const skus = variants.map((variant: VariantRow) => variant.sku).filter((sku): sku is string => Boolean(sku))
  if (new Set(skus).size !== skus.length) throw new APIError('Egy cikkszám csak egyszer szerepelhet.', 400)
  if (skus.length === 0) return data
  const ownId = originalDoc?.id ?? data.id
  const clash = await req.payload.find({
    collection: 'products',
    where: { and: [{ 'variants.sku': { in: skus } }, ...(ownId ? [{ id: { not_equals: ownId } }] : [])] },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
    draft: true,
  })
  if (clash.totalDocs > 0) throw new APIError('Valamelyik cikkszám már egy másik termékhez tartozik.', 409)
  return data
}

/** Relationship values arrive as ids or populated documents. */
function relationIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
  return list
    .map((item: unknown) => (typeof item === 'object' && item !== null && 'id' in item ? (item as { id: unknown }).id : item))
    .filter((item: unknown): item is string | number => typeof item === 'string' || typeof item === 'number')
    .map(String)
}

/** Hungarian reason why another product (current or former URL, or an unsaved form) holds the slug, or null. */
async function slugConflict(req: PayloadRequest, slug: string, ownId: string | null, operation: 'create' | 'update'): Promise<string | null> {
  const others = ownId ? [{ id: { not_equals: ownId } }] : []
  const current = await req.payload.count({ collection: 'products', where: { and: [{ slug: { equals: slug } }, ...others] }, req, overrideAccess: true })
  if (current.totalDocs > 0) return 'Ez az URL-azonosító már egy másik termékhez tartozik. Válasszon másikat.'
  const former = (await req.payload.find({ collection: 'product-slug-history', where: { slug: { equals: slug } }, limit: 1, depth: 0, req, overrideAccess: true })).docs[0]
  const owner = former ? relationIds(former.product)[0] : undefined
  if (former && owner !== ownId) return 'Ez az URL-azonosító egy másik termék korábbi címe (átirányítás mutat róla), ezért nem használható.'
  // On create, a reservation is normally this form's own (made by its first image upload).
  if (operation === 'update' && (await isReservedProductSlug(req.payload, slug, clock.now()))) {
    return 'Ezt az URL-azonosítót egy még nem mentett termékűrlap lefoglalta. Válasszon másikat.'
  }
  return null
}

/**
 * New products get a server-generated UUID (hidden, immutable) and, when no slug is entered, a unique
 * slug generated from the full name. A slug entered by an admin (or the API/CSV) is normalized and must
 * be free: a taken slug is a field error, never silently changed. The slug never follows later name
 * changes. The primary category (media paths) defaults to the first selected category.
 */
const assignProductIdentity: CollectionBeforeValidateHook = async ({ data, operation, originalDoc, req }) => {
  if (!data) return data
  if (operation === 'create' && !data.id) data.id = randomUUID()
  const entered = typeof data.slug === 'string' ? slugify(data.slug) : ''
  if (entered) {
    data.slug = entered
    if (entered !== originalDoc?.slug) {
      const ownId = operation === 'create' ? null : String(originalDoc?.id ?? '')
      const conflict = await slugConflict(req, entered, ownId, operation === 'create' ? 'create' : 'update')
      // A slug the create form generated from the name follows the generated-slug rule (suffix); a hand-chosen one is an error.
      if (conflict && operation === 'create' && data.slugAuto === true) data.slug = await reserveProductSlug(req.payload, entered, clock.now(), req)
      else if (conflict) throw new ValidationError({ collection: 'products', errors: [{ path: 'slug', message: conflict }] })
    }
  } else if (operation === 'create' && !data.slug) {
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    if (name) data.slug = await reserveProductSlug(req.payload, name, clock.now(), req)
  } else if ('slug' in data && !data.slug && originalDoc?.slug) {
    // Cleared: keep the stored slug. A value that normalizes to nothing ("!!!") stays and fails validation.
    data.slug = originalDoc.slug
  }
  if (data.categories !== undefined || data.primaryCategory !== undefined) {
    const categories = relationIds(data.categories ?? originalDoc?.categories)
    const primary = relationIds(data.primaryCategory ?? originalDoc?.primaryCategory)[0]
    data.primaryCategory = primary && categories.includes(primary) ? primary : (categories[0] ?? null)
  }
  return data
}

/**
 * The product now owns its slug: a form reservation is released. When a saved slug changes, the former
 * slug is recorded for the redirect (pointing at the product, so it always resolves to the current slug:
 * no chains), and a former slug the product takes back is removed (no loops). Media keep their keys.
 */
const trackSlugChanges: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (typeof doc.slug !== 'string') return doc
  await req.payload.delete({ collection: 'product-slug-reservations', where: { slug: { equals: doc.slug } }, req, overrideAccess: true })
  const previous = operation === 'update' && typeof previousDoc?.slug === 'string' ? previousDoc.slug : null
  if (previous && previous !== doc.slug) {
    await req.payload.delete({ collection: 'product-slug-history', where: { slug: { in: [previous, doc.slug] } }, req, overrideAccess: true })
    await req.payload.create({ collection: 'product-slug-history', data: { slug: previous, product: doc.id }, req, overrideAccess: true })
  }
  return doc
}

/** Only the product's own categories can be primary. */
const ownCategories: FilterOptions = ({ data }) => {
  const ids = relationIds((data as { categories?: unknown } | undefined)?.categories)
  return ids.length > 0 ? { id: { in: ids } } : false
}

/** Existing media can be chosen natively; new files go through the product-aware uploader (storage path from the form). */
function imagesField(name: string, label: string): Field {
  return {
    name,
    label,
    type: 'upload',
    relationTo: 'media',
    hasMany: true,
    admin: { components: { Field: '@/components/admin/ProductImagesField#ProductImagesField' } },
  }
}

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: 'Termék', plural: 'Termékek' },
  admin: {
    useAsTitle: 'name',
    group: 'Katalógus',
    defaultColumns: ['name', 'brand', 'orderability', 'featured', '_status'],
    listSearchableFields: ['name', 'model', 'slug', 'variants.sku'],
    description: 'Kézi termékkezelés. Tömeges felvitelhez használja a Termékimport (CSV) oldalt.',
  },
  // Native drafts provide the draft/published status.
  versions: { drafts: true, maxPerDoc: 20 },
  access: { read: publishedOrAdmin, create: adminOnly, update: adminOnly, delete: adminOnly, readVersions: adminOnly },
  fields: [
    // Server-generated UUID: read-only in the edit view, hidden on create and in the list; immutable (relations, orders and the CSV import use it).
    stableIdField({ description: 'Automatikusan generált UUID.', editViewOnly: true }),
    { name: 'name', label: 'Terméknév', type: 'text', required: true },
    slugField({ description: null, component: '@/components/admin/ProductSlugField#ProductSlugField' }),
    // Form-only flag (not stored): true while the create form's slug still follows the name, so the
    // server may add a suffix on collision instead of reporting a hand-chosen duplicate.
    { name: 'slugAuto', type: 'checkbox', virtual: true, defaultValue: true, admin: { hidden: true } },
    { name: 'model', label: 'Modell', type: 'text', required: true },
    { name: 'brand', label: 'Márka', type: 'relationship', relationTo: 'brands', required: true, index: true },
    { name: 'categories', label: 'Kategóriák', type: 'relationship', relationTo: 'categories', hasMany: true, required: true },
    {
      name: 'primaryCategory',
      label: 'Elsődleges kategória',
      type: 'relationship',
      relationTo: 'categories',
      filterOptions: ownCategories,
      admin: { description: 'Ez a kategória határozza meg a képek tárolási útvonalát (márka/kategória/termék/…). Üresen hagyva az első kiválasztott kategória.' },
    },
    { name: 'description', label: 'Leírás', type: 'textarea' },
    { name: 'featured', label: 'Kiemelt a főoldalon', type: 'checkbox', defaultValue: false },
    {
      name: 'orderability',
      label: 'Rendelhetőség (termékszint)',
      type: 'select',
      required: true,
      defaultValue: 'preorderable',
      options: ORDERABILITY_OPTIONS,
      admin: { description: 'Felülírja a változatok rendelhetőségét, ha nem „Előrendelhető”. Készletet nem kezelünk.' },
    },
    procurementGroup(),
    imagesField('images', 'Képek'),
    {
      name: 'specifications',
      label: 'Specifikáció',
      type: 'array',
      fields: [
        { name: 'title', label: 'Csoport', type: 'text', required: true },
        { name: 'items', label: 'Tulajdonságok', type: 'array', fields: [{ name: 'label', label: 'Megnevezés', type: 'text', required: true }, { name: 'value', label: 'Érték', type: 'text', required: true }] },
      ],
    },
    {
      name: 'variants',
      label: 'Változatok',
      type: 'array',
      minRows: 1,
      required: true,
      admin: { description: 'Minden változat saját cikkszámmal, árral és rendelhetőséggel rendelkezik. A katalógusár módosítása nem változtatja meg a már leadott rendeléseket.' },
      fields: [
        {
          name: 'sku',
          label: 'Cikkszám (SKU)',
          type: 'text',
          required: true,
          index: true,
          validate: (value: string | null | undefined) => (value && SKU_PATTERN.test(value.trim().toUpperCase()) ? true : 'Nagybetű, szám és kötőjel (2–64 karakter).'),
        },
        hexColorField('colorHex', 'Szín (HEX)'),
        { name: 'colorLabel', label: 'Szín megnevezése (opcionális)', type: 'text' },
        { name: 'storageGb', label: 'Tárhely (GB)', type: 'number', min: 1, max: 65536 },
        { name: 'ramGb', label: 'RAM (GB)', type: 'number', min: 1, max: 1024 },
        { name: 'caseSizeMm', label: 'Tokméret (mm)', type: 'number', min: 10, max: 100 },
        hufField('price', 'Ár (Ft)'),
        { name: 'orderability', label: 'Rendelhetőség', type: 'select', required: true, defaultValue: 'preorderable', options: ORDERABILITY_OPTIONS },
        procurementGroup(),
        imagesField('images', 'Változat képei'),
      ],
    },
    {
      name: 'seo',
      label: 'Keresőoptimalizálás',
      type: 'group',
      fields: [
        { name: 'title', label: 'Oldalcím', type: 'text' },
        { name: 'description', label: 'Leírás', type: 'textarea' },
      ],
    },
  ],
  hooks: { beforeValidate: [assignProductIdentity, enforceUniqueSkus], afterChange: [trackSlugChanges] },
}
