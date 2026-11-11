import { APIError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { adminOnly, publishedOrAdmin } from '@/collections/access'
import { hexColorField, hufField, ORDERABILITY_OPTIONS, slugField } from '@/collections/fields'

type VariantRow = { sku?: string | null }

/** SKUs are unique within a product and across all products (array fields cannot carry a global unique index). */
const enforceUniqueSkus: CollectionBeforeValidateHook = async ({ data, req, originalDoc }) => {
  const variants: VariantRow[] = Array.isArray(data?.variants) ? data.variants : []
  const skus = variants.map((variant: VariantRow) => variant.sku?.trim().toUpperCase()).filter((sku): sku is string => Boolean(sku))
  if (new Set(skus).size !== skus.length) throw new APIError('Egy cikkszám csak egyszer szerepelhet.', 400)
  if (skus.length === 0) return data
  const clash = await req.payload.find({
    collection: 'products',
    where: { and: [{ 'variants.sku': { in: skus } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
    draft: true,
  })
  if (clash.totalDocs > 0) throw new APIError('Valamelyik cikkszám már egy másik termékhez tartozik.', 409)
  return data
}

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: 'Termék', plural: 'Termékek' },
  admin: {
    useAsTitle: 'name',
    group: 'Katalógus',
    defaultColumns: ['name', 'brand', 'orderability', 'featured', '_status'],
    listSearchableFields: ['name', 'model', 'slug', 'variants.sku'],
  },
  // Native drafts provide the draft/published status.
  versions: { drafts: true, maxPerDoc: 20 },
  access: { read: publishedOrAdmin, create: adminOnly, update: adminOnly, delete: adminOnly, readVersions: adminOnly },
  fields: [
    { name: 'name', label: 'Terméknév', type: 'text', required: true },
    slugField(),
    { name: 'model', label: 'Modell', type: 'text', required: true },
    { name: 'brand', label: 'Márka', type: 'relationship', relationTo: 'brands', required: true, index: true },
    { name: 'categories', label: 'Kategóriák', type: 'relationship', relationTo: 'categories', hasMany: true, required: true },
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
    {
      name: 'procurementEstimate',
      label: 'Becsült beszerzési idő (munkanap)',
      type: 'group',
      fields: [
        { name: 'minDays', label: 'Minimum', type: 'number', min: 0 },
        { name: 'maxDays', label: 'Maximum', type: 'number', min: 0 },
      ],
    },
    { name: 'images', label: 'Képek', type: 'relationship', relationTo: 'media', hasMany: true },
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
      admin: { description: 'Minden változat saját cikkszámmal, árral és rendelhetőséggel rendelkezik.' },
      fields: [
        { name: 'sku', label: 'Cikkszám (SKU)', type: 'text', required: true, index: true },
        hexColorField('colorHex', 'Szín (HEX)'),
        { name: 'colorLabel', label: 'Szín megnevezése (opcionális)', type: 'text' },
        { name: 'storageGb', label: 'Tárhely (GB)', type: 'number', min: 1 },
        { name: 'ramGb', label: 'RAM (GB)', type: 'number', min: 1 },
        { name: 'caseSizeMm', label: 'Tokméret (mm)', type: 'number', min: 1 },
        hufField('price', 'Ár (Ft)'),
        { name: 'orderability', label: 'Rendelhetőség', type: 'select', required: true, defaultValue: 'preorderable', options: ORDERABILITY_OPTIONS },
        {
          name: 'procurementEstimate',
          label: 'Becsült beszerzési idő (munkanap)',
          type: 'group',
          fields: [
            { name: 'minDays', label: 'Minimum', type: 'number', min: 0 },
            { name: 'maxDays', label: 'Maximum', type: 'number', min: 0 },
          ],
        },
        { name: 'images', label: 'Változat képei', type: 'relationship', relationTo: 'media', hasMany: true },
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
  hooks: { beforeValidate: [enforceUniqueSkus] },
}
