import 'server-only'

import { payloadClient } from '@/dto/payload'
import type { StoreSetting } from '@/payload-types'
import type { DeliveryFee, DeliveryMethod, InfoPage, StoreSettings } from '@/types/settings'

type DeliveryRow = NonNullable<StoreSetting['deliveryMethods']>[number]

function toFee(row: DeliveryRow): DeliveryFee {
  if (row.feeKind === 'free') return { kind: 'free' }
  if (row.feeKind === 'fixed' && typeof row.feeAmount === 'number') return { kind: 'fixed', amount: row.feeAmount }
  // An unknown or incomplete fee is never treated as zero.
  return { kind: 'unknown' }
}

function toSettings(doc: StoreSetting): StoreSettings {
  return {
    storeName: doc.storeName,
    contact: { email: doc.contact?.email ?? '', phone: doc.contact?.phone ?? '', address: doc.contact?.address ?? '' },
    storeNotificationEmail: doc.storeNotificationEmail,
    contactRecipientEmail: doc.contactRecipientEmail,
    collection: {
      address: doc.collection?.address ?? '',
      openingHours: (doc.collection?.openingHours ?? []).map((row) => row.line),
      note: doc.collection?.note ?? '',
    },
    deliveryMethods: (doc.deliveryMethods ?? []).map(
      (row: DeliveryRow): DeliveryMethod => ({ id: row.methodId, kind: row.kind, name: row.name, description: row.description ?? '', enabled: row.enabled !== false, fee: toFee(row) }),
    ),
    legal: { termsVersion: doc.legal.termsVersion, privacyVersion: doc.legal.privacyVersion },
    seo: { defaultTitle: doc.seo?.defaultTitle ?? '', defaultDescription: doc.seo?.defaultDescription ?? '' },
    homepage: {
      heroTitle: doc.homepage?.heroTitle ?? '',
      heroText: doc.homepage?.heroText ?? '',
      featuredHeading: doc.homepage?.featuredHeading ?? '',
      highlights: (doc.homepage?.highlights ?? []).map((item) => ({ title: item.title ?? '', text: item.text ?? '' })),
    },
    pages: (doc.pages ?? []).map((page): InfoPage => ({ slug: page.slug, title: page.title, paragraphs: page.body.split(/\n\s*\n/).map((text: string) => text.trim()).filter(Boolean) })),
  }
}

/**
 * Store settings global. Server-side code reads it with full access (notification addresses are
 * needed for emails); only the public fields are rendered by pages. Throws if the settings have not
 * been initialized (run the initial import) instead of inventing defaults.
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  const payload = await payloadClient()
  const doc = await payload.findGlobal({ slug: 'store-settings', depth: 0, overrideAccess: true })
  if (!doc.storeName || !doc.legal?.termsVersion) {
    throw new Error('Az áruház beállításai hiányoznak az adatbázisból. Futtassa a kezdeti importot (npm run import:initial) vagy töltse ki az admin felületen.')
  }
  return toSettings(doc)
}

export async function getInfoPage(slug: string): Promise<InfoPage | null> {
  const settings = await getStoreSettings()
  return settings.pages.find((page: InfoPage) => page.slug === slug) ?? null
}
