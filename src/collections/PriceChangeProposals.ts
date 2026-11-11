import type { CollectionConfig, Field } from 'payload'

import { adminOnly, nobody } from '@/collections/access'
import { hufField, totalsGroup } from '@/collections/fields'
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
    { name: 'sentAt', label: 'Sikeresen elküldve', type: 'date', admin: { description: 'A válaszidő ettől az időponttól indul.' } },
  ],
})

/**
 * Price-change proposals. Decisions are made only by the customer through the decision page;
 * the admin UI can create and inspect proposals but deliberately cannot accept/reject them.
 * Creation must go through priceChangeService (supersession, order hold, email) – see docs.
 */
export const PriceChangeProposals: CollectionConfig = {
  slug: 'price-change-proposals',
  labels: { singular: 'Árváltozási ajánlat', plural: 'Árváltozási ajánlatok' },
  admin: { useAsTitle: 'id', group: 'Rendelések', defaultColumns: ['order', 'status', 'createdAt'] },
  access: { read: adminOnly, create: adminOnly, update: adminOnly, delete: () => false },
  fields: [
    { name: 'order', label: 'Rendelés', type: 'relationship', relationTo: 'orders', required: true, index: true },
    { name: 'status', label: 'Állapot', type: 'select', required: true, defaultValue: 'pending', index: true, options: Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => ({ value, label })), admin: { readOnly: true } },
    { name: 'explanation', label: 'Indoklás az ügyfélnek', type: 'textarea', required: true },
    {
      name: 'lines',
      label: 'Tételek',
      type: 'array',
      required: true,
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
    { name: 'supersedes', label: 'Felülírt ajánlat', type: 'relationship', relationTo: 'price-change-proposals', admin: { readOnly: true } },
    { name: 'supersededBy', label: 'Felülíró ajánlat', type: 'relationship', relationTo: 'price-change-proposals', admin: { readOnly: true } },
    { name: 'createdBy', label: 'Létrehozta', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    // SHA-256 hashes only; never readable through any API.
    { name: 'tokenHashes', type: 'json', access: { read: nobody, update: nobody, create: nobody }, admin: { hidden: true } },
  ],
}
