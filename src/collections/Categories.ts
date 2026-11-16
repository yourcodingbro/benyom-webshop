import type { CollectionConfig } from 'payload'

import { adminOnly, publicRead } from '@/collections/utils/access'
import { autoSlugAndId } from '@/collections/hooks/taxonomyHooks'
import { slugField, stableIdField } from '@/collections/utils/fields'
import { NAV_GROUPS } from '@/collections/utils/nav-groups'

/** Categories are brand-independent; brand navigation is derived from products. */
export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Kategória', plural: 'Kategóriák' },
  admin: { useAsTitle: 'name', group: NAV_GROUPS.STORE, defaultColumns: ['name', 'slug'], description: 'A sorrend fogd és vidd módszerrel állítható (fogantyú a sor elején; billentyűzettel: Tab a fogantyúra, Szóköz, nyilak, Szóköz). Ez a kézi sorrend a bolti navigációban és listákban; a főoldali népszerűség a heti eladásokból számolódik.' },
  // Manual order: Payload's native orderable list (fractional `_order` keys, only the moved row is written).
  orderable: true,
  defaultSort: '_order',
  access: { read: publicRead, create: adminOnly, update: adminOnly, delete: adminOnly },
  fields: [
    stableIdField({ description: 'Üresen hagyva a slugból képezzük (cat-…). Létrehozás után nem módosítható; a CSV-import ezzel azonosít.' }),
    { name: 'name', label: 'Név', type: 'text', required: true },
    slugField(),
    { name: 'description', label: 'Leírás', type: 'textarea' },
    // Legacy columns kept (non-destructive); the manual order is `_order`, popularity is computed from sales.
    { name: 'sortOrder', label: 'Sorrend (régi)', type: 'number', defaultValue: 100, admin: { hidden: true } },
    { name: 'popularityRank', label: 'Népszerűségi sorrend (régi)', type: 'number', required: true, defaultValue: 100, min: 1, admin: { hidden: true } },
  ],
  hooks: { beforeValidate: [autoSlugAndId('categories', 'cat')] },
}
