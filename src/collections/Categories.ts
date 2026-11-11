import type { CollectionConfig } from 'payload'

import { adminOnly, publicRead } from '@/collections/access'
import { slugField } from '@/collections/fields'

/** Categories are brand-independent; brand navigation is derived from products. */
export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Kategória', plural: 'Kategóriák' },
  admin: { useAsTitle: 'name', group: 'Katalógus', defaultColumns: ['name', 'slug', 'sortOrder'] },
  access: { read: publicRead, create: adminOnly, update: adminOnly, delete: adminOnly },
  fields: [
    { name: 'name', label: 'Név', type: 'text', required: true },
    slugField(),
    { name: 'description', label: 'Leírás', type: 'textarea' },
    { name: 'sortOrder', label: 'Sorrend', type: 'number', defaultValue: 100 },
    { name: 'popularityRank', label: 'Népszerűségi sorrend', type: 'number', required: true, defaultValue: 100, min: 1, admin: { description: 'Kézzel megadott rangsor (1 = legnépszerűbb). A főoldal az első hármat mutatja. Nem eladási statisztika.' } },
  ],
}
