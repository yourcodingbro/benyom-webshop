import 'server-only'

import { payloadClient } from '@/dto/payload'
import { AppError } from '@/lib/errors'
import type { BrandingAsset, PaymentSetting, StoreSetting } from '@/payload-types'
import type { BrandingImage, DeliveryFee, DeliveryMethod, EmailSettings, FaqEntry, HomepageSettings, InfoPage, PaymentSettings, SiteChrome, StoreSettings } from '@/types/settings'

type DeliveryRow = NonNullable<PaymentSetting['deliveryMethods']>[number]

function toFee(row: DeliveryRow): DeliveryFee {
  if (row.feeKind === 'free') return { kind: 'free' }
  // Payload validation and a database constraint require the amount; a fixed fee is never read as free.
  if (typeof row.feeAmount !== 'number' || !Number.isSafeInteger(row.feeAmount) || row.feeAmount < 0) {
    throw new AppError('INVALID_STATE', `A(z) „${row.methodId}” szállítási mód fix díja hiányzik vagy érvénytelen.`)
  }
  return { kind: 'fixed', amount: row.feeAmount }
}

function toSettings(doc: StoreSetting): StoreSettings {
  return {
    storeName: doc.storeName,
    contact: { email: doc.contact?.email ?? '', phone: doc.contact?.phone ?? '', address: doc.contact?.address ?? '' },
    legal: { termsVersion: doc.legal.termsVersion, privacyVersion: doc.legal.privacyVersion },
    limits: {
      maxLineQuantity: doc.limits.maxLineQuantity,
      maxCartLines: doc.limits.maxCartLines,
      priceChangeResponseHours: doc.limits.priceChangeResponseHours,
      priceChangeReminderHours: doc.limits.priceChangeReminderHours,
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

function toBrandingImage(value: number | BrandingAsset | null | undefined): BrandingImage | null {
  if (!value || typeof value === 'number' || !value.url) return null
  return { url: value.url, alt: value.alt, mimeType: value.mimeType ?? '', width: value.width ?? null, height: value.height ?? null }
}

/** Logo and favicon (Áruház beállítások → Fejléc) and the footer slogan (→ Lábléc); public data. */
export async function getSiteChrome(): Promise<SiteChrome> {
  const payload = await payloadClient()
  const doc = await payload.findGlobal({ slug: 'store-settings', depth: 1, overrideAccess: true, select: { logo: true, favicon: true, footerSlogan: true } })
  return { logo: toBrandingImage(doc.logo), favicon: toBrandingImage(doc.favicon), footerSlogan: doc.footerSlogan ?? '' }
}

/** Email beállítások: sender and store recipient. Server-only: never pass these to a page or a client component. */
export async function getEmailSettings(): Promise<EmailSettings> {
  const payload = await payloadClient()
  const doc = await payload.findGlobal({ slug: 'email-settings', depth: 0, overrideAccess: true })
  return { contactEmail: doc.storeContactEmail?.trim() || null, emailFrom: doc.emailFrom?.trim() || null }
}

/** Főoldal beállítások: hero, featured-products grid and highlights. */
export async function getHomepageSettings(): Promise<HomepageSettings> {
  const payload = await payloadClient()
  const doc = await payload.findGlobal({ slug: 'homepage-settings', depth: 0, overrideAccess: true })
  return {
    heroTitle: doc.heroTitle ?? '',
    heroText: doc.heroText ?? '',
    // Fallbacks = the field defaults, for a database whose homepage settings were never saved.
    heroPrimaryLabel: doc.heroPrimaryLabel ?? 'Termékek böngészése',
    heroSecondaryLabel: doc.heroSecondaryLabel ?? 'Hogyan működik?',
    featured: { heading: doc.featured?.heading ?? '', count: doc.featured?.count ?? 8, columns: doc.featured?.columns ?? 4, rows: doc.featured?.rows ?? 2 },
    highlights: (doc.highlights ?? []).map((item) => ({ title: item.title ?? '', text: item.text ?? '' })),
  }
}

/** Published FAQ entries (GYIK beállítások) in their manual order. */
export async function getPublishedFaqs(): Promise<FaqEntry[]> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'faqs', where: { published: { equals: true } }, sort: '_order', pagination: false, depth: 0, overrideAccess: true })
  return result.docs.map((doc) => ({ id: String(doc.id), question: doc.question, answer: doc.answer }))
}

/** Fizetési és szállítási beállítások: payment page texts, delivery methods with fees, collection point (public). */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const payload = await payloadClient()
  const doc = await payload.findGlobal({ slug: 'payment-settings', depth: 0, overrideAccess: true })
  return {
    paymentPage: {
      title: doc.paymentPage?.title ?? 'Fizetés és szállítás',
      intro: doc.paymentPage?.intro ?? '',
      // Fizetési tudnivalók group (shown as the page's "Fizetés" section).
      paymentHeading: doc.paymentKnowledge?.paymentHeading ?? 'Fizetés',
      paymentItems: (doc.paymentKnowledge?.paymentItems ?? []).map((item) => item.text),
      methodsHeading: doc.paymentPage?.methodsHeading ?? 'Átvételi és szállítási módok',
      collectionHeading: doc.paymentPage?.collectionHeading ?? 'Személyes átvétel',
      openingHoursHeading: doc.paymentPage?.openingHoursHeading ?? 'Nyitvatartás',
      processHeading: doc.preorderSteps?.processHeading ?? 'Az előrendelés menete',
      // "Az előrendelés menete" group.
      processSteps: (doc.preorderSteps?.processSteps ?? []).map((item) => item.text),
    },
    deliveryMethods: (doc.deliveryMethods ?? []).map(
      (row: DeliveryRow): DeliveryMethod => ({ id: row.methodId, kind: row.kind, name: row.name, description: row.description ?? '', enabled: row.enabled !== false, fee: toFee(row) }),
    ),
    collection: {
      address: doc.collection?.address ?? '',
      openingHours: (doc.collection?.openingHours ?? []).map((row) => row.line),
      note: doc.collection?.note ?? '',
    },
  }
}
