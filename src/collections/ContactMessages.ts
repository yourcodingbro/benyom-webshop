import type { CollectionConfig } from 'payload'

import { adminOnly, serverOnly } from '@/collections/access'

/** Contact-form messages. Stored idempotently by `submissionKey`; forwarded to the store by email. */
export const ContactMessages: CollectionConfig = {
  slug: 'contact-messages',
  labels: { singular: 'Kapcsolati üzenet', plural: 'Kapcsolati üzenetek' },
  admin: { useAsTitle: 'subject', group: 'E-mail', defaultColumns: ['receivedAt', 'name', 'email', 'subject', 'notificationStatus'], listSearchableFields: ['name', 'email', 'subject'] },
  access: { read: adminOnly, create: serverOnly, update: serverOnly, delete: adminOnly },
  defaultSort: '-receivedAt',
  fields: [
    { name: 'id', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'submissionKey', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true, hidden: true } },
    { name: 'name', label: 'Név', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'email', label: 'E-mail', type: 'email', required: true, admin: { readOnly: true } },
    { name: 'subject', label: 'Tárgy', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'message', label: 'Üzenet', type: 'textarea', required: true, admin: { readOnly: true } },
    { name: 'privacyVersion', label: 'Adatkezelési tájékoztató verziója', type: 'text', admin: { readOnly: true } },
    { name: 'receivedAt', label: 'Beérkezett', type: 'date', required: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'notificationStatus',
      label: 'Továbbítás',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Folyamatban', value: 'pending' },
        { label: 'Elküldve', value: 'sent' },
        { label: 'Naplózva (nem küldött)', value: 'sent_simulated' },
        { label: 'Sikertelen', value: 'failed' },
      ],
      admin: { readOnly: true },
    },
  ],
}
