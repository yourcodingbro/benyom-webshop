import type { CollectionConfig, Field } from 'payload'

import { adminOnly, nobody, serverOnly } from '@/collections/access'
import { hufField, options, totalsGroup } from '@/collections/fields'
import { PROPOSAL_STATUS_LABELS } from '@/config/labels'

const dispatchGroup = (name: string, label: string): Field => ({
  name,
  label,
  type: 'group',
  admin: { readOnly: true },
  fields: [
    { name: 'attempts', label: 'Kísérletek', type: 'number', defaultValue: 0 },
    { name: 'firstAttemptAt', label: 'Első kísérlet', type: 'date' },
    { name: 'lastAttemptAt', label: 'Utolsó kísérlet', type: 'date' },
    { name: 'lastError', label: 'Utolsó hiba', type: 'text' },
    { name: 'claimedAt', label: 'Küldés folyamatban óta', type: 'date' },
    { name: 'sentAt', label: 'Szolgáltató átvette', type: 'date', admin: { description: 'A válaszidő ettől az időponttól indul. Naplózó módban és sikertelen küldésnél üres marad.' } },
  ],
})

/**
 * Price-change proposals. Created only from the order view (OrderActions → priceChangeService) and
 * decided only by the customer on the decision page (POST) or by expiry. No API can create, change or
 * delete them directly. Ids are stable text ids: decision tokens are HMAC-derived from them.
 */
export const PriceChangeProposals: CollectionConfig = {
  slug: 'price-change-proposals',
  labels: { singular: 'Árváltozási ajánlat', plural: 'Árváltozási ajánlatok' },
  admin: {
    useAsTitle: 'id',
    group: 'Rendelések',
    defaultColumns: ['id', 'orderReference', 'status', 'proposedTotals.grandTotal', 'isDemo', 'createdAt'],
    listSearchableFields: ['id', 'orderReference'],
    description: 'Új ajánlat a rendelés oldaláról indítható. Elfogadni vagy elutasítani csak az ügyfél tudja.',
  },
  access: { read: adminOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  defaultSort: '-createdAt',
  fields: [
    { name: 'id', label: 'Azonosító', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'order', label: 'Rendelés', type: 'relationship', relationTo: 'orders', required: true, index: true, admin: { readOnly: true } },
    { name: 'orderReference', label: 'Rendelésazonosító', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'status', label: 'Állapot', type: 'select', required: true, defaultValue: 'pending', index: true, options: options(PROPOSAL_STATUS_LABELS), admin: { readOnly: true } },
    { name: 'isDemo', label: 'DEMÓ (történeti mintaadat)', type: 'checkbox', defaultValue: false, index: true, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'version', label: 'Verzió', type: 'number', defaultValue: 1, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'explanation', label: 'Indoklás az ügyfélnek', type: 'textarea', required: true, admin: { readOnly: true } },
    {
      name: 'lines',
      label: 'Tételek',
      type: 'array',
      required: true,
      admin: { readOnly: true },
      fields: [
        { name: 'lineId', type: 'text', required: true },
        { name: 'sku', label: 'Cikkszám', type: 'text' },
        { name: 'productName', label: 'Termék', type: 'text' },
        { name: 'quantity', label: 'Mennyiség', type: 'number' },
        hufField('originalUnitPrice', 'Eredeti egységár'),
        hufField('proposedUnitPrice', 'Javasolt egységár'),
      ],
    },
    totalsGroup('originalTotals', 'Eredeti összesítő', true),
    totalsGroup('proposedTotals', 'Javasolt összesítő', true),
    dispatchGroup('proposalEmail', 'Ajánlat e-mail'),
    dispatchGroup('reminderEmail', 'Emlékeztető e-mail'),
    { name: 'resolvedAt', label: 'Lezárva', type: 'date', admin: { readOnly: true } },
    { name: 'supersedesId', label: 'Felülírt ajánlat', type: 'text', admin: { readOnly: true } },
    { name: 'supersededById', label: 'Felülíró ajánlat', type: 'text', admin: { readOnly: true } },
    { name: 'createdBy', label: 'Létrehozta', type: 'text', admin: { readOnly: true } },
    { name: 'createdByUser', label: 'Létrehozó admin', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    // SHA-256 hashes of the decision tokens, stored only after the provider accepted the email. Never readable through any API.
    { name: 'proposalTokenHash', type: 'text', index: true, access: { read: nobody, update: nobody, create: nobody }, admin: { hidden: true } },
    { name: 'reminderTokenHash', type: 'text', index: true, access: { read: nobody, update: nobody, create: nobody }, admin: { hidden: true } },
  ],
}
