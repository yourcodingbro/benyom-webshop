import { randomUUID } from 'node:crypto'

import type { CollectionBeforeValidateHook, Field, TextFieldSingleValidation } from 'payload'

import { freeSlug } from '@/collections/hooks/slugs'
import { normalizeHexColor } from '@/lib/hex'
import { slugify } from '@/lib/slug'

export const validateHex: TextFieldSingleValidation = (value) =>
  value === null || value === undefined || value === '' || normalizeHexColor(value) !== null ? true : 'A színkód formátuma #RRGGBB legyen (pl. #1C1C1E).'

/** HEX color stored as normalized `#RRGGBB`; no color name required. */
export function hexColorField(name: string, label: string, required: boolean = false, readOnly: boolean = false): Field {
  return {
    name,
    label,
    type: 'text',
    required,
    validate: validateHex,
    admin: { description: 'Hat számjegyű HEX kód, pl. #1C1C1E. Mentéskor nagybetűsre normalizáljuk.', placeholder: '#000000', readOnly },
    hooks: {
      beforeChange: [({ value }) => (typeof value === 'string' ? (normalizeHexColor(value) ?? value) : value)],
    },
  }
}

export const SLUG_PATTERN: RegExp = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Same rule as the CSV import (product_id). */
export const STABLE_ID_PATTERN: RegExp = /^[a-z0-9][a-z0-9-]{1,79}$/
/** Same rule as the CSV import (sku). */
export const SKU_PATTERN: RegExp = /^[A-Z0-9][A-Z0-9-]{1,63}$/

/**
 * Unique URL slug. Left empty, the server derives it from the name on creation (accents folded, unique
 * suffix on collision); afterwards it never follows name changes, so published URLs stay stable.
 */
export function slugField(options: { description?: string | null; component?: string } = {}): Field {
  return {
    name: 'slug',
    label: 'URL-azonosító (slug)',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    // Empty is accepted (the collection hook fills it), and so is anything the server can normalize
    // ("Nothing Phone 3" → nothing-phone-3); the hook stores the normalized value.
    validate: (value: string | null | undefined) => (!value || slugify(value) !== '' ? true : 'Csak kisbetű, szám és kötőjel használható.'),
    admin: {
      // null: no helper text under the field (validation messages still show).
      description: options.description === null ? undefined : (options.description ?? 'Üresen hagyva a névből képezzük (egyedi utótaggal, ha foglalt). A név későbbi módosítása nem változtatja meg.'),
      ...(options.component ? { components: { Field: options.component } } : {}),
    },
    hooks: { beforeDuplicate: [() => undefined] },
  }
}

/**
 * Text primary key, immutable after creation; the CSV import identifies records by it. Brands and
 * categories derive a readable id from the slug (e.g. `brand-apple`); products get a UUID.
 */
export function stableIdField(options: { description: string; editViewOnly?: boolean }): Field {
  return {
    name: 'id',
    label: 'Azonosító',
    type: 'text',
    required: true,
    validate: (value: string | null | undefined) => (!value || STABLE_ID_PATTERN.test(value) ? true : 'Kisbetű, szám és kötőjel (2–80 karakter).'),
    // editViewOnly: read-only in the edit view, absent from the create view and the list columns.
    admin: options.editViewOnly
      ? { description: options.description, readOnly: true, disableBulkEdit: true, disableListColumn: true, components: { Field: '@/components/admin/EditViewOnlyField#EditViewOnlyField' } }
      : { description: options.description },
    access: { update: () => false },
    hooks: { beforeDuplicate: [() => undefined] },
  }
}

/** Brands and categories: slug from the name, id from the slug, both only when left empty on creation. */
export function autoSlugAndId(collection: 'brands' | 'categories', idPrefix: string): CollectionBeforeValidateHook {
  return async ({ data, operation, req }) => {
    if (!data) return data
    if (typeof data.slug === 'string' && data.slug) data.slug = slugify(data.slug)
    if (operation !== 'create') return data
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    const slug = typeof data.slug === 'string' && data.slug ? data.slug : name ? await freeSlug(req.payload, collection, name, req) : data.slug
    let id = data.id
    if (!id && typeof slug === 'string' && slug) {
      const candidate = `${idPrefix}-${slug}`.slice(0, 80)
      const clash = await req.payload.count({ collection, where: { id: { equals: candidate } }, overrideAccess: true, req })
      id = clash.totalDocs > 0 ? `${idPrefix}-${randomUUID()}` : candidate
    }
    return { ...data, slug, id }
  }
}

export function hufField(name: string, label: string, required: boolean = true): Field {
  return {
    name,
    label,
    type: 'number',
    required,
    min: 0,
    validate: (value: number | null | undefined) =>
      value === null || value === undefined ? (required ? 'Kötelező mező.' : true) : Number.isSafeInteger(value) && value >= 0 ? true : 'Egész forintösszeg szükséges.',
    admin: { description: 'Bruttó ár egész forintban (HUF).' },
  }
}

export const ORDERABILITY_OPTIONS: { label: string; value: string }[] = [
  { label: 'Előrendelhető', value: 'preorderable' },
  { label: 'Átmenetileg nem rendelhető', value: 'temporarily_unavailable' },
  { label: 'Megszűnt / archivált', value: 'discontinued' },
]

export function procurementGroup(): Field {
  return {
    name: 'procurementEstimate',
    label: 'Becsült beszerzési idő (munkanap)',
    type: 'group',
    fields: [
      { name: 'minDays', label: 'Minimum', type: 'number', min: 0, max: 365 },
      {
        name: 'maxDays',
        label: 'Maximum',
        type: 'number',
        min: 0,
        max: 365,
        validate: (value: number | null | undefined, { siblingData }: { siblingData: { minDays?: number | null } }) =>
          value === null || value === undefined || siblingData.minDays === null || siblingData.minDays === undefined || value >= siblingData.minDays
            ? true
            : 'A maximum nem lehet kisebb a minimumnál.',
      },
    ],
  }
}

export function totalsGroup(name: string, label: string, readOnly: boolean = false): Field {
  return {
    name,
    label,
    type: 'group',
    admin: { readOnly },
    fields: [hufField('itemsTotal', 'Termékek összesen'), hufField('deliveryFee', 'Szállítási díj'), hufField('grandTotal', 'Végösszeg'), { name: 'currency', label: 'Pénznem', type: 'text', defaultValue: 'HUF' }],
  }
}

export const options = (labels: Record<string, string>): { label: string; value: string }[] => Object.entries(labels).map(([value, label]) => ({ value, label }))
