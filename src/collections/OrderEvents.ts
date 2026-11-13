import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'

import { adminOnly, serverOnly } from '@/collections/access'

const appendOnly: CollectionBeforeChangeHook = ({ operation, data }) => {
  if (operation !== 'create') throw new APIError('A rendelési napló nem módosítható.', 403)
  return data
}

const neverDelete: CollectionBeforeDeleteHook = () => {
  throw new APIError('A rendelési napló nem törölhető.', 403)
}

export const ORDER_EVENT_TYPE_LABELS: Record<string, string> = {
  submitted: 'Rendelés leadva',
  imported: 'Demó import',
  status_changed: 'Állapotváltás',
  payment_changed: 'Fizetési állapot',
  admin_edit: 'Admin módosítás',
  note_added: 'Megjegyzés',
  price_review_flagged: 'Árellenőrzés jelölve',
  proposal_created: 'Ajánlat létrehozva',
  proposal_superseded: 'Ajánlat felülírva',
  proposal_accepted: 'Ajánlat elfogadva',
  proposal_rejected: 'Ajánlat elutasítva',
  proposal_expired: 'Ajánlat lejárt',
  proposal_withdrawn: 'Ajánlat visszavonva',
  cancelled: 'Rendelés törölve',
  notification_queued: 'Értesítés sorba állítva',
  notification_skipped: 'Értesítés kihagyva (beállítás)',
  notification_submitted: 'Értesítés átadva a szolgáltatónak',
  notification_failed: 'Értesítés sikertelen',
  notification_delivered: 'Értesítés kézbesítve',
  notification_bounced: 'Értesítés visszapattant',
}

/**
 * Append-only order audit trail. Written only by server code inside the same transaction as the
 * change it records; no API (including admins) can create, edit or delete entries.
 * Holds no secrets and only the personal data needed to understand the change.
 */
export const OrderEvents: CollectionConfig = {
  slug: 'order-events',
  labels: { singular: 'Naplóbejegyzés', plural: 'Rendelési napló' },
  admin: {
    useAsTitle: 'message',
    group: 'Rendelések',
    defaultColumns: ['at', 'orderReference', 'type', 'actorLabel', 'message'],
    listSearchableFields: ['orderReference', 'message', 'actorLabel'],
  },
  access: { read: adminOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  defaultSort: '-at',
  timestamps: true,
  fields: [
    { name: 'order', label: 'Rendelés', type: 'relationship', relationTo: 'orders', required: true, index: true, admin: { readOnly: true } },
    { name: 'orderReference', label: 'Rendelésazonosító', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'at', label: 'Időpont', type: 'date', required: true, index: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime', displayFormat: 'yyyy.MM.dd HH:mm:ss' } } },
    { name: 'type', label: 'Művelet', type: 'select', required: true, index: true, options: Object.entries(ORDER_EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label })), admin: { readOnly: true } },
    { name: 'actorType', label: 'Szereplő típusa', type: 'select', required: true, options: [{ label: 'Admin', value: 'admin' }, { label: 'Ügyfél', value: 'customer' }, { label: 'Rendszer', value: 'system' }], admin: { readOnly: true } },
    { name: 'actorUser', label: 'Admin felhasználó', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'actorLabel', label: 'Szereplő', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'message', label: 'Esemény', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'reason', label: 'Indoklás', type: 'textarea', admin: { readOnly: true } },
    { name: 'previousValue', label: 'Korábbi érték', type: 'json', admin: { readOnly: true } },
    { name: 'newValue', label: 'Új érték', type: 'json', admin: { readOnly: true } },
    { name: 'proposal', label: 'Árváltozási ajánlat', type: 'relationship', relationTo: 'price-change-proposals', admin: { readOnly: true } },
    { name: 'emailMessage', label: 'E-mail', type: 'relationship', relationTo: 'email-messages', admin: { readOnly: true } },
  ],
  // Defense in depth (plus a database trigger): even overrideAccess server code cannot rewrite history.
  hooks: { beforeChange: [appendOnly], beforeDelete: [neverDelete] },
}
