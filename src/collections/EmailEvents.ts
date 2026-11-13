import type { CollectionConfig } from 'payload'

import { adminOnly, serverOnly } from '@/collections/access'

/**
 * Verified Resend webhook events. The unique `eventId` (svix-id) makes duplicate deliveries no-ops;
 * `occurredAt` lets older events arrive after newer ones without moving an email back in state.
 */
export const EmailEvents: CollectionConfig = {
  slug: 'email-events',
  labels: { singular: 'Kézbesítési esemény', plural: 'Kézbesítési események' },
  admin: { useAsTitle: 'type', group: 'E-mail', defaultColumns: ['receivedAt', 'type', 'providerMessageId', 'applied'] },
  access: { read: adminOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  defaultSort: '-receivedAt',
  fields: [
    { name: 'eventId', label: 'Esemény azonosító (svix-id)', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'type', label: 'Típus', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'providerMessageId', label: 'Resend üzenetazonosító', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'emailMessage', label: 'E-mail', type: 'relationship', relationTo: 'email-messages', admin: { readOnly: true } },
    { name: 'occurredAt', label: 'Esemény ideje', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'receivedAt', label: 'Beérkezett', type: 'date', required: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'applied', label: 'Állapotot módosított', type: 'checkbox', defaultValue: false, admin: { readOnly: true } },
    { name: 'detail', label: 'Részletek', type: 'text', admin: { readOnly: true } },
  ],
}
