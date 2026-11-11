import type { HufAmount } from '@/types/common'

/** Unknown is never zero: a method with an unknown fee cannot be ordered. */
export type DeliveryFee =
  | { kind: 'unknown' }
  | { kind: 'free' }
  | { kind: 'fixed'; amount: HufAmount; isSampleValue: boolean }

export type DeliveryMethodKind = 'collection' | 'delivery'

export type DeliveryMethod = {
  id: string
  kind: DeliveryMethodKind
  name: string
  description: string
  enabled: boolean
  fee: DeliveryFee
}

export type InfoPage = {
  slug: string
  title: string
  paragraphs: string[]
}

export type StoreSettings = {
  storeName: string
  isSampleContent: boolean
  contact: { email: string; phone: string; address: string }
  storeNotificationEmail: string
  collection: { address: string; openingHours: string[]; note: string }
  deliveryMethods: DeliveryMethod[]
  legal: { termsVersion: string; privacyVersion: string }
  seo: { defaultTitle: string; defaultDescription: string }
  homepage: {
    heroTitle: string
    heroText: string
    featuredHeading: string
    highlights: { title: string; text: string }[]
  }
  pages: InfoPage[]
}
