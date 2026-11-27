import type { Access, CollectionConfig } from 'payload'

import { adminOnly, isAdminRequest } from '@/collections/utils/access'
import { NAV_GROUPS } from '@/collections/utils/nav-groups'

/** Visitors see published questions only; admins see all. */
const publishedOrAdmin: Access = ({ req }) => (isAdminRequest(req) ? true : { published: { equals: true } })

/** Questions and answers of /gyik, in manual (drag-and-drop) order. */
export const Faqs: CollectionConfig = {
  slug: 'faqs',
  labels: { singular: 'GYIK-kérdés', plural: 'GYIK beállítások' },
  admin: {
    useAsTitle: 'question',
    group: NAV_GROUPS.SETTINGS,
    // Managed in Áruház beállítások → GYIK (no sidebar entry); Payload's document drawer still edits the records.
    hidden: true,
    defaultColumns: ['question', 'published'],
    description: 'A /gyik oldal kérdései. A sorrend fogd és vidd módszerrel állítható; a „Megjelenik” kikapcsolásával egy kérdés törlés nélkül elrejthető.',
  },
  orderable: true,
  defaultSort: '_order',
  access: { read: publishedOrAdmin, create: adminOnly, update: adminOnly, delete: adminOnly },
  fields: [
    { name: 'question', label: 'Kérdés', type: 'text', required: true },
    { name: 'answer', label: 'Válasz', type: 'textarea', required: true },
    { name: 'published', label: 'Megjelenik', type: 'checkbox', defaultValue: true, index: true },
  ],
}
