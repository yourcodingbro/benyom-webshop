import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/collections/utils/access'
import { NAV_GROUPS } from '@/collections/utils/nav-groups'
import { validateSender } from '@/lib/email-address'

const statusSwitch = (name: string, label: string, defaultValue: boolean) => ({ name, label, type: 'checkbox', defaultValue }) as const

/**
 * Email beállítások: the sender and the store recipient, and the automatic customer emails per order status. Server-side
 * configuration only: admin-only, never part of a public read. The transport (EMAIL_MODE, RESEND_API_KEY) and all
 * secrets stay in environment variables. Read on every send and status change, so a change applies without a redeploy.
 */
export const EmailSettings: GlobalConfig = {
  slug: 'email-settings',
  label: 'Email beállítások',
  admin: { group: NAV_GROUPS.SETTINGS },
  access: { read: adminOnly, update: adminOnly },
  fields: [
    {
      // Sender and recipient side by side at equal width (Payload row layout; stacks on narrow screens).
      type: 'row',
      fields: [
        {
          name: 'emailFrom',
          label: 'Feladó (From)',
          type: 'text',
          validate: validateSender,
          admin: {
            width: '50%',
            placeholder: 'Webshop <rendeles@example.hu>',
            description:
              'Formátum: „Webshop <rendeles@example.hu>” vagy „rendeles@example.hu”. A domainnek ellenőrzöttnek kell lennie a Resendben (Domains); a mező módosítása nem kerüli meg a szolgáltató korlátozásait (pl. a tesztkorlátozást). Éles küldéshez (EMAIL_MODE=resend) kötelező. A módosítás azonnal érvényes, újratelepítés nélkül.',
          },
        },
        {
          // Not "contactEmail": that name is the public contact address in Áruház beállítások → Kapcsolat.
          name: 'storeContactEmail',
          label: 'Kapcsolati e-mail (bolti értesítések címzettje)',
          type: 'email',
          admin: {
            width: '50%',
            description: 'Ide érkeznek a kapcsolati űrlap üzenetei és az új rendelések bolti értesítései. A látogató címe csak válaszcím (Reply-To) lesz, sosem feladó.',
          },
        },
      ],
    },
    // Former recipient fields, replaced by storeContactEmail; kept hidden and unused so no stored value is lost.
    { name: 'storeNotificationEmail', label: 'Bolti értesítési e-mail (régi)', type: 'email', admin: { hidden: true } },
    { name: 'contactRecipientEmail', label: 'Kapcsolati űrlap címzettje (régi)', type: 'email', admin: { hidden: true } },
    {
      // Applied centrally in the Orders hook to every status change (admin, API, services, scheduler).
      name: 'statusEmails',
      label: 'Automatikus e-mail az ügyfélnek, amikor a rendelés állapota…',
      type: 'group',
      admin: {
        description:
          'A módosítás csak a későbbi állapotváltásokra hat; korábbi értesítést nem küld újra. A rendelés visszaigazolása, a bolti értesítés és az árváltozási e-mailek mindig kimennek; azokat itt nem lehet kikapcsolni.',
      },
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
