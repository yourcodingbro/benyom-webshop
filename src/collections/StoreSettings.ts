import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/collections/access'

/** Store-wide settings (contact, collection point, delivery methods and fees, legal versions, SEO, homepage, info pages). */
export const StoreSettings: GlobalConfig = {
  slug: 'store-settings',
  label: 'Áruház beállításai',
  admin: { group: 'Beállítások' },
  access: { read: () => true, update: adminOnly },
  fields: [
    { name: 'storeName', label: 'Áruház neve', type: 'text', required: true },
    { name: 'storeNotificationEmail', label: 'Bolti értesítési e-mail', type: 'email', required: true, access: { read: ({ req }) => Boolean(req.user) } },
    { name: 'contactRecipientEmail', label: 'Kapcsolati űrlap címzettje', type: 'email', required: true, access: { read: ({ req }) => Boolean(req.user) }, admin: { description: 'Ide érkeznek a kapcsolati űrlap üzenetei. A látogató címe csak válaszcím (Reply-To) lesz.' } },
    { name: 'contact', label: 'Kapcsolat', type: 'group', fields: [{ name: 'email', label: 'E-mail', type: 'email' }, { name: 'phone', label: 'Telefon', type: 'text' }, { name: 'address', label: 'Cím', type: 'text' }] },
    {
      name: 'collection',
      label: 'Személyes átvétel',
      type: 'group',
      fields: [
        { name: 'address', label: 'Átvételi cím', type: 'text' },
        { name: 'openingHours', label: 'Nyitvatartás', type: 'array', fields: [{ name: 'line', label: 'Sor', type: 'text', required: true }] },
        { name: 'note', label: 'Megjegyzés', type: 'textarea' },
      ],
    },
    {
      name: 'deliveryMethods',
      label: 'Szállítási módok',
      type: 'array',
      fields: [
        { name: 'methodId', label: 'Azonosító', type: 'text', required: true },
        { name: 'kind', label: 'Típus', type: 'select', required: true, options: [{ label: 'Személyes átvétel', value: 'collection' }, { label: 'Kiszállítás', value: 'delivery' }] },
        { name: 'name', label: 'Név', type: 'text', required: true },
        { name: 'description', label: 'Leírás', type: 'textarea' },
        { name: 'enabled', label: 'Elérhető', type: 'checkbox', defaultValue: true },
        {
          name: 'feeKind',
          label: 'Díj típusa',
          type: 'select',
          required: true,
          defaultValue: 'unknown',
          options: [{ label: 'Még nincs meghatározva (nem rendelhető)', value: 'unknown' }, { label: 'Kifejezetten ingyenes', value: 'free' }, { label: 'Fix díj', value: 'fixed' }],
          admin: { description: 'Az ismeretlen díj soha nem számít nullának; ilyen módszerrel nem adható le rendelés.' },
        },
        {
          name: 'feeAmount',
          label: 'Díj (Ft)',
          type: 'number',
          min: 0,
          admin: { condition: (_data, sibling) => sibling?.feeKind === 'fixed' },
          validate: (value: number | null | undefined, { siblingData }: { siblingData: Record<string, unknown> }) =>
            siblingData.feeKind !== 'fixed' || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ? true : 'Fix díjhoz egész forintösszeg szükséges.',
        },
      ],
    },
    { name: 'legal', label: 'Jogi dokumentumok verziói', type: 'group', fields: [{ name: 'termsVersion', label: 'ÁSZF verzió', type: 'text', required: true }, { name: 'privacyVersion', label: 'Adatkezelési tájékoztató verzió', type: 'text', required: true }] },
    { name: 'seo', label: 'SEO alapértékek', type: 'group', fields: [{ name: 'defaultTitle', label: 'Alapértelmezett cím', type: 'text' }, { name: 'defaultDescription', label: 'Alapértelmezett leírás', type: 'textarea' }] },
    {
      name: 'homepage',
      label: 'Főoldal',
      type: 'group',
      fields: [
        { name: 'heroTitle', label: 'Fő cím', type: 'text' },
        { name: 'heroText', label: 'Bevezető szöveg', type: 'textarea' },
        { name: 'featuredHeading', label: 'Kiemelt termékek címe', type: 'text' },
        { name: 'highlights', label: 'Előnyök', type: 'array', fields: [{ name: 'title', label: 'Cím', type: 'text' }, { name: 'text', label: 'Szöveg', type: 'textarea' }] },
      ],
    },
    {
      name: 'pages',
      label: 'Tájékoztató oldalak (ÁSZF, adatvédelem, szállítás, garancia, GYIK, kapcsolat)',
      type: 'array',
      fields: [
        { name: 'slug', label: 'URL-azonosító', type: 'text', required: true },
        { name: 'title', label: 'Cím', type: 'text', required: true },
        { name: 'body', label: 'Tartalom (bekezdések üres sorral elválasztva)', type: 'textarea', required: true },
      ],
    },
  ],
}
