import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/collections/utils/access'
import { boundedIntField } from '@/collections/utils/fields'
import { NAV_GROUPS } from '@/collections/utils/nav-groups'
import { FEATURED_GRID_LIMITS } from '@/config/shop'

type FeaturedSibling = { columns?: unknown; rows?: unknown }

/** The featured product count must fit the desktop grid (rows × columns). */
function validateFeaturedCount(value: number | null | undefined, options: { siblingData: FeaturedSibling }): string | true {
  const columns = Number(options.siblingData.columns)
  const rows = Number(options.siblingData.rows)
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > FEATURED_GRID_LIMITS.maxCount) {
    return `Egész szám 1 és ${FEATURED_GRID_LIMITS.maxCount} között.`
  }
  if (Number.isSafeInteger(columns) && Number.isSafeInteger(rows) && value > columns * rows) {
    return `Legfeljebb ${columns * rows} termék fér el (${rows} sor × ${columns} oszlop). Növelje a sorok vagy oszlopok számát, vagy csökkentse a termékszámot.`
  }
  return true
}

/** Főoldal beállítások: the homepage hero, the featured-products grid and the highlights. Homepage metadata stays in code. */
export const HomepageSettings: GlobalConfig = {
  slug: 'homepage-settings',
  label: 'Főoldal beállítások',
  admin: { group: NAV_GROUPS.SETTINGS },
  access: { read: () => true, update: adminOnly },
  fields: [
    { name: 'heroTitle', label: 'Fő cím', type: 'text' },
    { name: 'heroText', label: 'Bevezető szöveg', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'heroPrimaryLabel', label: 'Első gomb felirata (→ Összes termék)', type: 'text', required: true, defaultValue: 'Termékek böngészése' },
        { name: 'heroSecondaryLabel', label: 'Második gomb felirata (→ GYIK)', type: 'text', required: true, defaultValue: 'Hogyan működik?' },
      ],
    },
    {
      name: 'featured',
      label: 'Kiemelt termékek',
      type: 'group',
      admin: {
        description:
          'A „Kiemelt” jelölésű termékek közül legfeljebb a megadott számút mutatjuk, asztali nézetben a megadott oszlopszámmal. Sorok × oszlopok a rács befogadóképessége: a termékszám nem lehet nagyobb ennél (pl. 3 termék: 1 × 3, 6 termék: 2 × 3, 8 termék: 2 × 4). Ha kevesebb kiemelt termék van, a rács üres helyek nélkül, részben töltődik ki. Telefonon egy, tableten két oszlop marad.',
      },
      fields: [
        { name: 'heading', label: 'Blokk címe', type: 'text', defaultValue: 'Kiemelt termékek' },
        {
          type: 'row',
          fields: [
            { name: 'count', label: 'Termékek száma', type: 'number', required: true, defaultValue: 8, min: 1, max: FEATURED_GRID_LIMITS.maxCount, validate: validateFeaturedCount },
            boundedIntField('columns', 'Oszlopok (asztali)', 4, FEATURED_GRID_LIMITS.minColumns, FEATURED_GRID_LIMITS.maxColumns),
            boundedIntField('rows', 'Sorok (asztali)', 2, 1, FEATURED_GRID_LIMITS.maxRows),
          ],
        },
      ],
    },
    {
      name: 'highlights',
      label: 'Előnyök',
      type: 'array',
      fields: [
        { name: 'title', label: 'Cím', type: 'text' },
        { name: 'text', label: 'Szöveg', type: 'textarea' },
      ],
    },
  ],
}
