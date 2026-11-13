import type { CollectionBeforeValidateHook, Field, TextFieldSingleValidation } from 'payload'

import { normalizeHexColor } from '@/lib/hex'

export const validateHex: TextFieldSingleValidation = (value) =>
  value === null || value === undefined || value === '' || normalizeHexColor(value) !== null ? true : 'A színkód formátuma #RRGGBB legyen (pl. #1C1C1E).'

/** HEX color stored as normalized `#RRGGBB`; no color name required. */
export function hexColorField(name: string, label: string, required: boolean = false): Field {
  return {
    name,
    label,
    type: 'text',
    required,
    validate: validateHex,
    admin: { description: 'Hat számjegyű HEX kód, pl. #1C1C1E. Mentéskor nagybetűsre normalizáljuk.', placeholder: '#000000' },
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

export function slugField(): Field {
  return {
    name: 'slug',
    label: 'URL-azonosító (slug)',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    validate: (value: string | null | undefined) => (value && SLUG_PATTERN.test(value) ? true : 'Csak kisbetű, szám és kötőjel használható.'),
  }
}

/**
 * Stable, human-readable text primary key (e.g. `prod-iphone-17`). Keeps sample and CSV identifiers
 * valid across environments and makes re-imports idempotent. Filled from the slug when left empty.
 */
export function stableIdField(): Field {
  return {
    name: 'id',
    label: 'Stabil azonosító',
    type: 'text',
    required: true,
    validate: (value: string | null | undefined) => (value && STABLE_ID_PATTERN.test(value) ? true : 'Kisbetű, szám és kötőjel (2–80 karakter).'),
    admin: { description: 'Üresen hagyva a slugból képezzük. Létrehozás után nem módosítható; a CSV-import ezzel azonosít.' },
    access: { update: () => false },
  }
}

export function defaultIdFromSlug(prefix: string): CollectionBeforeValidateHook {
  return ({ data, operation }) => {
    if (operation === 'create' && data && !data.id && typeof data.slug === 'string' && data.slug) {
      return { ...data, id: `${prefix}-${data.slug}` }
    }
    return data
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
