import { APIError, type CollectionBeforeChangeHook, type CollectionConfig, type Field } from 'payload'

import { adminOnly, isAdminRequest } from '@/collections/access'
import { hexColorField, hufField, totalsGroup } from '@/collections/fields'
import { FULFILLMENT_LABELS, isFulfillmentStatus, PAYMENT_LABELS, PRICE_APPROVAL_LABELS } from '@/config/labels'
import { FULFILLMENT_TRANSITIONS } from '@/config/order-rules'

const options = (labels: Record<string, string>): { label: string; value: string }[] => Object.entries(labels).map(([value, label]) => ({ value, label }))

/** Snapshot fields are read-only in the admin UI; the beforeChange hook enforces it for every API. */
function readOnly<T extends Field>(field: T): T {
  return { ...field, admin: { ...field.admin, readOnly: true } }
}

const addressFields: Field[] = [
  { name: 'postalCode', label: 'Irányítószám', type: 'text' },
  { name: 'city', label: 'Település', type: 'text' },
  { name: 'street', label: 'Utca, házszám', type: 'text' },
  { name: 'country', label: 'Ország', type: 'text', defaultValue: 'HU' },
]

/** Fields that form the immutable submission snapshot. */
const SNAPSHOT_FIELDS: readonly string[] = ['reference', 'idempotencyKey', 'submissionHash', 'submittedAt', 'items', 'customer', 'billingAddress', 'shippingAddress', 'delivery', 'submittedTotals', 'terms', 'note', 'submissionSnapshot']

/** Enforces the immutable snapshot, the transition table and the price-approval hold for every API. */
const protectSnapshotAndTransitions: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !originalDoc) return data
  if (req.user && !isAdminRequest(req)) throw new APIError('Nincs jogosultság.', 403)
  for (const field of SNAPSHOT_FIELDS) {
    if (field in data && JSON.stringify(data[field]) !== JSON.stringify(originalDoc[field])) {
      throw new APIError('A beküldési pillanatkép nem módosítható.', 400)
    }
  }
  const from = String(originalDoc.fulfillmentStatus)
  const to = typeof data.fulfillmentStatus === 'string' ? data.fulfillmentStatus : from
  if (to !== from && to !== 'cancelled') {
    if (originalDoc.priceApprovalStatus === 'pending') throw new APIError('A teljesítés szünetel, amíg az ügyfél nem dönt az árváltozásról.', 409)
    if (!isFulfillmentStatus(from) || !isFulfillmentStatus(to) || !FULFILLMENT_TRANSITIONS[from].includes(to)) throw new APIError('Nem engedélyezett állapotváltás.', 400)
  }
  return { ...data, version: (Number(originalDoc.version) || 1) + 1 }
}

/**
 * Orders: admin-only for every operation and every API (REST, GraphQL, Local API with
 * overrideAccess: false). The storefront creates orders only through server-side DTO code.
 */
export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'Rendelés', plural: 'Rendelések' },
  admin: {
    useAsTitle: 'reference',
    group: 'Rendelések',
    defaultColumns: ['reference', 'customer.name', 'fulfillmentStatus', 'priceApprovalStatus', 'createdAt'],
    listSearchableFields: ['reference', 'customer.name', 'customer.email'],
  },
  access: { read: adminOnly, create: adminOnly, update: adminOnly, delete: () => false },
  fields: [
    readOnly({ name: 'reference', label: 'Rendelésazonosító', type: 'text', required: true, unique: true, index: true }),
    readOnly({ name: 'idempotencyKey', label: 'Idempotencia-kulcs', type: 'text', required: true, unique: true, index: true }),
    readOnly({ name: 'submissionHash', label: 'Beküldési lenyomat', type: 'text' }),
    readOnly({ name: 'submittedAt', label: 'Leadva', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } }),
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Állapot',
          fields: [
            { name: 'fulfillmentStatus', label: 'Teljesítési állapot', type: 'select', required: true, defaultValue: 'received', options: options(FULFILLMENT_LABELS), index: true },
            { name: 'paymentStatus', label: 'Fizetés', type: 'select', required: true, defaultValue: 'unpaid', options: options(PAYMENT_LABELS), admin: { description: 'Fizetés kizárólag átvételkor vagy kiszállításkor.' } },
            { name: 'priceApprovalStatus', label: 'Árjóváhagyás', type: 'select', required: true, defaultValue: 'not_required', options: options(PRICE_APPROVAL_LABELS) },
            { name: 'needsPriceReview', label: 'Árellenőrzés javasolt', type: 'checkbox' },
            {
              name: 'cancellation',
              label: 'Törlés',
              type: 'group',
              fields: [
                { name: 'reason', label: 'Ok', type: 'select', options: [{ label: 'Árváltozás elutasítva', value: 'price_change_rejected' }, { label: 'Árváltozás határideje lejárt', value: 'price_change_timeout' }, { label: 'Bolti törlés', value: 'admin' }] },
                { name: 'note', label: 'Megjegyzés', type: 'textarea' },
                { name: 'at', label: 'Időpont', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
              ],
            },
            { name: 'adminNotes', label: 'Belső megjegyzések', type: 'array', fields: [{ name: 'text', label: 'Szöveg', type: 'textarea', required: true }, { name: 'at', label: 'Időpont', type: 'date' }] },
          ],
        },
        {
          label: 'Tételek (pillanatkép)',
          fields: [
            readOnly({
              name: 'items',
              label: 'Tételek a leadáskor',
              type: 'array',
              fields: [
                { name: 'lineId', type: 'text' },
                { name: 'productName', label: 'Termék', type: 'text' },
                { name: 'sku', label: 'Cikkszám', type: 'text' },
                hexColorField('colorHex', 'Szín (HEX)'),
                { name: 'attributes', label: 'Tulajdonságok', type: 'text' },
                hufField('unitPrice', 'Egységár'),
                { name: 'quantity', label: 'Mennyiség', type: 'number' },
                hufField('lineTotal', 'Sorösszeg'),
                hufField('catalogUnitPrice', 'Katalógusár leadáskor'),
              ],
            }),
            readOnly(totalsGroup('submittedTotals', 'Leadáskori összesítő')),
            readOnly({ name: 'submissionSnapshot', label: 'Teljes beküldési pillanatkép (JSON)', type: 'json' }),
          ],
        },
        {
          label: 'Ügyfél és szállítás',
          fields: [
            readOnly({ name: 'customer', label: 'Ügyfél', type: 'group', fields: [{ name: 'name', label: 'Név', type: 'text', index: true }, { name: 'email', label: 'E-mail', type: 'email', index: true }, { name: 'phone', label: 'Telefon', type: 'text' }, { name: 'companyName', label: 'Cégnév', type: 'text' }, { name: 'taxNumber', label: 'Adószám', type: 'text' }] }),
            readOnly({ name: 'billingAddress', label: 'Számlázási cím', type: 'group', fields: addressFields }),
            readOnly({ name: 'shippingAddress', label: 'Szállítási cím', type: 'group', fields: addressFields }),
            readOnly({ name: 'delivery', label: 'Átvétel módja', type: 'group', fields: [{ name: 'methodId', type: 'text' }, { name: 'kind', type: 'text' }, { name: 'name', label: 'Név', type: 'text' }, hufField('fee', 'Díj')] }),
            readOnly({ name: 'note', label: 'Ügyfél megjegyzése', type: 'textarea' }),
            readOnly({ name: 'terms', label: 'Elfogadott feltételek', type: 'group', fields: [{ name: 'termsVersion', label: 'ÁSZF verzió', type: 'text' }, { name: 'privacyVersion', label: 'Adatkezelési verzió', type: 'text' }, { name: 'acceptedAt', label: 'Elfogadva', type: 'date' }] }),
          ],
        },
        {
          label: 'Ár és előzmények',
          fields: [
            readOnly(totalsGroup('agreedTotals', 'Érvényes (elfogadott) összesítő')),
            readOnly({ name: 'agreedLines', label: 'Érvényes egységárak', type: 'json' }),
            readOnly({ name: 'events', label: 'Állapot- és ajánlatelőzmények', type: 'array', fields: [{ name: 'at', label: 'Időpont', type: 'date' }, { name: 'type', label: 'Típus', type: 'text' }, { name: 'actor', label: 'Szereplő', type: 'text' }, { name: 'message', label: 'Esemény', type: 'text' }] }),
            readOnly({ name: 'notifications', label: 'Értesítések', type: 'array', fields: [{ name: 'templateId', label: 'Sablon', type: 'text' }, { name: 'recipientRole', label: 'Címzett', type: 'text' }, { name: 'status', label: 'Állapot', type: 'text' }, { name: 'attemptedAt', label: 'Kísérlet', type: 'date' }, { name: 'sentAt', label: 'Elküldve', type: 'date' }, { name: 'error', label: 'Hiba', type: 'text' }] }),
          ],
        },
      ],
    },
    { name: 'version', label: 'Verzió', type: 'number', defaultValue: 1, admin: { readOnly: true, position: 'sidebar' } },
  ],
  hooks: { beforeChange: [protectSnapshotAndTransitions] },
}
