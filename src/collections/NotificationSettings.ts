import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/collections/access'

const statusSwitch = (name: string, label: string, defaultValue: boolean) =>
  ({ name, label, type: 'checkbox', defaultValue }) as const

/**
 * Independent switches for automatic customer emails per order status transition. Applied
 * centrally in the Orders hook to every status change (admin, API, services, scheduler). Separate
 * from EMAIL_MODE. Price-change proposal, reminder and decision emails are part of the approval
 * workflow and are always sent; they are not configured here.
 */
export const NotificationSettings: GlobalConfig = {
  slug: 'notification-settings',
  label: 'Értesítési beállítások',
  admin: {
    group: 'Beállítások',
    description: 'Automatikus ügyfél e-mail állapotváltáskor. A módosítás csak a későbbi állapotváltásokra hat; korábbi értesítést nem küld újra.',
  },
  access: { read: adminOnly, update: adminOnly },
  fields: [
    {
      name: 'statusEmails',
      label: 'Automatikus e-mail az ügyfélnek, amikor a rendelés állapota…',
      type: 'group',
      fields: [
        statusSwitch('under_review', '„Ellenőrzés alatt” lesz', false),
        statusSwitch('confirmed', '„Visszaigazolva” lesz', true),
        statusSwitch('procurement_in_progress', '„Beszerzés folyamatban” lesz', false),
        statusSwitch('ready_for_collection', '„Átvehető” lesz', true),
        statusSwitch('dispatched', '„Kiszállítás alatt” lesz', true),
        statusSwitch('completed', '„Teljesítve” lesz', true),
        statusSwitch('cancelled', '„Törölve” lesz (bolti törlés)', true),
      ],
    },
  ],
}
