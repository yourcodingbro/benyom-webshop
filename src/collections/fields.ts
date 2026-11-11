import type { Field, TextFieldSingleValidation } from 'payload'

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

export function slugField(): Field {
  return {
    name: 'slug',
    label: 'URL-azonosító (slug)',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    validate: (value: string | null | undefined) => (value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? true : 'Csak kisbetű, szám és kötőjel használható.'),
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

export function totalsGroup(name: string, label: string, readOnly: boolean = false): Field {
  return {
    name,
    label,
    type: 'group',
    admin: { readOnly },
    fields: [hufField('itemsTotal', 'Termékek összesen'), hufField('deliveryFee', 'Szállítási díj'), hufField('grandTotal', 'Végösszeg'), { name: 'currency', label: 'Pénznem', type: 'text', defaultValue: 'HUF' }],
  }
}
