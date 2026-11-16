import type { CollectionConfig } from 'payload'

import { adminOnly, serverOnly } from '@/collections/access'

/**
 * Completed sales, one row per order line and attributed brand/category (a product in several
 * categories counts once in each, so category totals overlap). Written once, in the same transaction
 * that records the sale (receipt + payment + completion); the unique `entryKey` makes repeats
 * impossible. Demo orders never produce entries. Source of the weekly popularity ranking.
 */
export const SaleEntries: CollectionConfig = {
  slug: 'sale-entries',
  labels: { singular: 'Eladási tétel', plural: 'Eladási napló' },
  admin: {
    group: 'Rendelések',
    useAsTitle: 'orderReference',
    defaultColumns: ['soldAt', 'orderReference', 'sku', 'dimension', 'key', 'quantity'],
    description: 'Csak olvasható. Átvett, kifizetett és teljesített rendelések tételei; ebből számolódik a heti népszerűség.',
  },
  access: { read: adminOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  defaultSort: '-soldAt',
  fields: [
    { name: 'entryKey', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'order', label: 'Rendelés', type: 'relationship', relationTo: 'orders', required: true, index: true, admin: { readOnly: true } },
    { name: 'orderReference', label: 'Rendelésazonosító', type: 'text', admin: { readOnly: true } },
    { name: 'lineId', type: 'text', admin: { readOnly: true } },
    { name: 'sku', label: 'Cikkszám', type: 'text', admin: { readOnly: true } },
    { name: 'dimension', label: 'Szempont', type: 'select', required: true, options: [{ label: 'Márka', value: 'brand' }, { label: 'Kategória', value: 'category' }], admin: { readOnly: true } },
    { name: 'key', label: 'Márka / kategória azonosító', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'quantity', label: 'Darab', type: 'number', required: true, admin: { readOnly: true } },
    { name: 'soldAt', label: 'Eladás időpontja', type: 'date', required: true, index: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
