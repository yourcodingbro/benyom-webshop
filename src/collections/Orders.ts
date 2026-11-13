import type { CollectionConfig, Field } from 'payload'

import { adminOnly, serverOnly } from '@/collections/access'
import { hexColorField, hufField, options, totalsGroup } from '@/collections/fields'
import { orderEndpoints } from '@/collections/endpoints'
import { auditOrderChange, protectOrder } from '@/collections/hooks/orderHooks'
import { FULFILLMENT_LABELS, PAYMENT_LABELS, PRICE_APPROVAL_LABELS } from '@/config/labels'

/** Snapshot fields are read-only in the admin UI; protectOrder enforces it for every API. */
function readOnly<T extends Field>(field: T): T {
  return { ...field, admin: { ...field.admin, readOnly: true } }
}

const addressFields: Field[] = [
  { name: 'postalCode', label: 'Irányítószám', type: 'text' },
  { name: 'city', label: 'Település', type: 'text' },
  { name: 'street', label: 'Utca, házszám', type: 'text' },
  { name: 'country', label: 'Ország', type: 'text', defaultValue: 'HU' },
]

/**
 * Orders: admin-only for every operation and every API. Orders are created only by the storefront
 * checkout (orderService) or the initial import; they are never deleted. Price, proposal and
 * cancellation fields change only through services (see OrderActions); every change is audited.
 */
export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'Rendelés', plural: 'Rendelések' },
  admin: {
    useAsTitle: 'reference',
    group: 'Rendelések',
    defaultColumns: ['reference', 'customer.name', 'fulfillmentStatus', 'priceApprovalStatus', 'agreedTotals.grandTotal', 'isDemo', 'createdAt'],
    listSearchableFields: ['reference', 'customer.name', 'customer.email', 'customer.phone'],
    description: 'Keresés azonosító, név, e-mail vagy telefon alapján; szűrés állapotra, dátumra, demó jelölésre.',
  },
  access: { read: adminOnly, create: serverOnly, update: adminOnly, delete: serverOnly },
  defaultSort: '-createdAt',
  endpoints: orderEndpoints,
  fields: [
    readOnly({ name: 'reference', label: 'Rendelésazonosító', type: 'text', required: true, unique: true, index: true }),
    readOnly({
      name: 'isDemo',
      label: 'DEMÓ (történeti mintaadat)',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Kezdeti importból származó, kitalált rendelés. Nem kap e-mailt, nem kerül ütemezett feldolgozásba.' },
    }),
    readOnly({ name: 'idempotencyKey', label: 'Idempotencia-kulcs', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } }),
    readOnly({ name: 'submissionHash', label: 'Beküldési lenyomat', type: 'text', admin: { position: 'sidebar' } }),
    readOnly({ name: 'submittedAt', label: 'Leadva', type: 'date', index: true, admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } }),
    { name: 'version', label: 'Verzió', type: 'number', defaultValue: 1, admin: { readOnly: true, position: 'sidebar', description: 'Egyidejű módosítások elleni védelem.' } },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Állapot és műveletek',
          fields: [
            { name: 'fulfillmentStatus', label: 'Teljesítési állapot', type: 'select', required: true, defaultValue: 'received', options: options(FULFILLMENT_LABELS), index: true, admin: { description: 'Csak engedélyezett lépés választható; törléshez használja a lenti műveletet.' } },
            { name: 'paymentStatus', label: 'Fizetés', type: 'select', required: true, defaultValue: 'unpaid', options: options(PAYMENT_LABELS), admin: { description: 'Fizetés kizárólag átvételkor vagy kiszállításkor.' } },
            readOnly({ name: 'priceApprovalStatus', label: 'Árjóváhagyás', type: 'select', required: true, defaultValue: 'not_required', options: options(PRICE_APPROVAL_LABELS), index: true }),
            { name: 'needsPriceReview', label: 'Árellenőrzés javasolt', type: 'checkbox' },
            {
              name: 'orderActions',
              type: 'ui',
              admin: { components: { Field: '@/components/admin/OrderActions#OrderActions' } },
            },
            readOnly({
              name: 'cancellation',
              label: 'Törlés',
              type: 'group',
              fields: [
                { name: 'reason', label: 'Ok', type: 'select', options: [{ label: 'Árváltozás elutasítva', value: 'price_change_rejected' }, { label: 'Árváltozás határideje lejárt', value: 'price_change_timeout' }, { label: 'Bolti törlés', value: 'admin' }] },
                { name: 'note', label: 'Indoklás', type: 'textarea' },
                { name: 'at', label: 'Időpont', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
              ],
            }),
            { name: 'adminNotes', label: 'Belső megjegyzések', type: 'array', fields: [{ name: 'text', label: 'Szöveg', type: 'textarea', required: true }, { name: 'at', label: 'Időpont', type: 'date' }] },
          ],
        },
        {
          label: 'Tételek és árak',
          fields: [
            readOnly({
              name: 'items',
              label: 'Tételek a leadáskor (pillanatkép)',
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
            readOnly(totalsGroup('submittedTotals', 'Leadáskori összesítő (eredeti)')),
            readOnly(totalsGroup('agreedTotals', 'Érvényes (elfogadott) összesítő')),
            readOnly({ name: 'agreed', label: 'Érvényes egységárak (JSON)', type: 'json' }),
            readOnly({ name: 'submission', label: 'Teljes beküldési pillanatkép (JSON)', type: 'json' }),
          ],
        },
        {
          label: 'Ügyfél és szállítás',
          fields: [
            readOnly({
              name: 'customer',
              label: 'Ügyfél',
              type: 'group',
              fields: [
                { name: 'name', label: 'Név', type: 'text', index: true },
                { name: 'email', label: 'E-mail', type: 'email', index: true },
                { name: 'phone', label: 'Telefon', type: 'text' },
                { name: 'companyName', label: 'Cégnév', type: 'text' },
                { name: 'taxNumber', label: 'Adószám', type: 'text' },
              ],
            }),
            readOnly({ name: 'billingAddress', label: 'Számlázási cím', type: 'group', fields: addressFields }),
            readOnly({ name: 'shippingAddress', label: 'Szállítási cím', type: 'group', fields: addressFields }),
            readOnly({ name: 'delivery', label: 'Átvétel módja', type: 'group', fields: [{ name: 'methodId', type: 'text' }, { name: 'kind', type: 'text' }, { name: 'name', label: 'Név', type: 'text' }, hufField('fee', 'Díj')] }),
            readOnly({ name: 'note', label: 'Ügyfél megjegyzése', type: 'textarea' }),
            readOnly({ name: 'terms', label: 'Elfogadott feltételek', type: 'group', fields: [{ name: 'termsVersion', label: 'ÁSZF verzió', type: 'text' }, { name: 'privacyVersion', label: 'Adatkezelési verzió', type: 'text' }, { name: 'acceptedAt', label: 'Elfogadva', type: 'date' }] }),
          ],
        },
        {
          label: 'Előzmények',
          fields: [
            { name: 'history', label: 'Műveleti napló (időrendben)', type: 'join', collection: 'order-events', on: 'order', defaultSort: 'at', defaultLimit: 200, admin: { defaultColumns: ['at', 'type', 'actorLabel', 'message', 'reason'], allowCreate: false } },
            { name: 'proposals', label: 'Árváltozási ajánlatok', type: 'join', collection: 'price-change-proposals', on: 'order', defaultSort: '-createdAt', admin: { allowCreate: false } },
            { name: 'emails', label: 'E-mailek', type: 'join', collection: 'email-messages', on: 'order', defaultSort: '-queuedAt', admin: { defaultColumns: ['queuedAt', 'templateId', 'to', 'status'], allowCreate: false } },
          ],
        },
      ],
    },
  ],
  hooks: { beforeChange: [protectOrder], afterChange: [auditOrderChange] },
}
