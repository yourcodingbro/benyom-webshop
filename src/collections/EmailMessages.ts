import type { CollectionConfig } from 'payload'

import { adminOnly, serverOnly } from '@/collections/access'
import { emailEndpoints } from '@/collections/endpoints'

export const EMAIL_STATUS_LABELS: Record<string, string> = {
  queued: 'Sorban áll',
  submitted: 'Átadva a szolgáltatónak',
  delivered: 'Kézbesítve',
  failed: 'Sikertelen',
  bounced: 'Visszapattant',
  suppressed: 'Letiltott címzett',
  cancelled: 'Megszakítva',
  skipped: 'Kihagyva (beállítás)',
  simulated: 'Naplózva (nem küldött)',
}

export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  'order-received': 'Rendelés visszaigazolása',
  'store-new-order': 'Új rendelés (bolt)',
  'price-change-proposal': 'Árváltozási ajánlat',
  'price-change-reminder': 'Árváltozás – emlékeztető',
  'price-change-accepted': 'Árváltozás elfogadva',
  'cancelled-after-rejection': 'Törlés elutasítás után',
  'cancelled-after-timeout': 'Törlés határidő után',
  'cancelled-by-store': 'Bolti törlés',
  'fulfillment-update': 'Állapotváltozás',
  'contact-message': 'Kapcsolati üzenet',
}

/**
 * Email history and durable notification jobs in one record per logical email (unique idempotency
 * key). Admin read-only; written only by server code. `previewHtml`/`previewText` are a snapshot of the
 * rendered React Email content with token-bearing links redacted, so later template changes never
 * rewrite history. Decision tokens are never stored: they are re-derived (HMAC) at send time.
 */
export const EmailMessages: CollectionConfig = {
  slug: 'email-messages',
  labels: { singular: 'E-mail', plural: 'E-mail előzmények' },
  admin: {
    useAsTitle: 'subject',
    group: 'E-mail',
    defaultColumns: ['queuedAt', 'templateId', 'to', 'orderReference', 'status', 'attempts'],
    listSearchableFields: ['to', 'subject', 'orderReference', 'providerMessageId'],
    description: 'Minden alkalmazás által küldött (vagy kihagyott) e-mail. A „Kézbesítve” állapotot csak a Resend webhook állítja be; a szolgáltató általi átvétel nem kézbesítés.',
  },
  access: { read: adminOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  defaultSort: '-queuedAt',
  endpoints: emailEndpoints,
  fields: [
    { name: 'previewAndActions', type: 'ui', admin: { components: { Field: '@/components/admin/EmailPreview#EmailPreview' } } },
    {
      type: 'row',
      fields: [
        { name: 'templateId', label: 'Sablon', type: 'select', required: true, index: true, options: Object.entries(EMAIL_TEMPLATE_LABELS).map(([value, label]) => ({ value, label })), admin: { readOnly: true } },
        { name: 'category', label: 'Típus', type: 'select', required: true, options: [{ label: 'Ügyfél', value: 'customer' }, { label: 'Bolti értesítés', value: 'store' }, { label: 'Kapcsolati üzenet', value: 'contact' }], admin: { readOnly: true } },
        { name: 'status', label: 'Állapot', type: 'select', required: true, index: true, options: Object.entries(EMAIL_STATUS_LABELS).map(([value, label]) => ({ value, label })), admin: { readOnly: true } },
      ],
    },
    { name: 'idempotencyKey', label: 'Idempotencia-kulcs', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'to', label: 'Címzett', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'from', label: 'Feladó', type: 'text', admin: { readOnly: true } },
    { name: 'replyTo', label: 'Válaszcím', type: 'text', admin: { readOnly: true } },
    { name: 'subject', label: 'Tárgy', type: 'text', admin: { readOnly: true } },
    { name: 'mode', label: 'Kézbesítési mód', type: 'select', options: [{ label: 'Resend (éles)', value: 'resend' }, { label: 'Naplózó (nem küld)', value: 'log' }, { label: 'Hibás beállítás', value: 'invalid' }], admin: { readOnly: true } },
    { name: 'order', label: 'Rendelés', type: 'relationship', relationTo: 'orders', index: true, admin: { readOnly: true } },
    { name: 'orderReference', label: 'Rendelésazonosító', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'proposal', label: 'Árváltozási ajánlat', type: 'relationship', relationTo: 'price-change-proposals', admin: { readOnly: true } },
    { name: 'contactMessage', label: 'Kapcsolati üzenet', type: 'relationship', relationTo: 'contact-messages', admin: { readOnly: true } },
    { name: 'isDemo', label: 'Demó adathoz tartozik', type: 'checkbox', defaultValue: false, index: true, admin: { readOnly: true } },
    {
      type: 'collapsible',
      label: 'Kézbesítés és újrapróbálás',
      fields: [
        { name: 'attempts', label: 'Kísérletek száma', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'queuedAt', label: 'Sorba állítva', type: 'date', index: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'nextAttemptAt', label: 'Következő kísérlet', type: 'date', index: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'claimedAt', label: 'Feldolgozás alatt óta', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'firstAttemptAt', label: 'Első kísérlet', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'lastAttemptAt', label: 'Utolsó kísérlet', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'submittedAt', label: 'Szolgáltató átvette', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'deliveredAt', label: 'Kézbesítve (webhook)', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'providerMessageId', label: 'Resend üzenetazonosító', type: 'text', index: true, admin: { readOnly: true } },
        { name: 'lastEventType', label: 'Utolsó szolgáltatói esemény', type: 'text', admin: { readOnly: true } },
        { name: 'lastEventAt', label: 'Utolsó esemény ideje', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'lastError', label: 'Utolsó hiba (tisztítva)', type: 'textarea', admin: { readOnly: true } },
        { name: 'skipReason', label: 'Kihagyás oka', type: 'text', admin: { readOnly: true } },
      ],
    },
    { name: 'templateRef', label: 'Sablon hivatkozásai', type: 'json', admin: { readOnly: true, description: 'Csak azonosítók (rendelés, ajánlat, állapot). Tokent vagy linket nem tárolunk.' } },
    { name: 'previewHtml', type: 'textarea', admin: { hidden: true } },
    { name: 'previewText', label: 'Szöveges tartalom (pillanatkép, linkek eltávolítva)', type: 'textarea', admin: { readOnly: true } },
  ],
}
