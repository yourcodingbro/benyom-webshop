import 'server-only'

import { copy, sampleStore } from '@/dto/sample-store'
import type { InfoPage, StoreSettings } from '@/types/settings'

/** Later: `payload.findGlobal({ slug: 'store-settings' })`, normalized to StoreSettings. */
export async function getStoreSettings(): Promise<StoreSettings> {
  return copy(sampleStore().settings)
}

export async function getInfoPage(slug: string): Promise<InfoPage | null> {
  const page = sampleStore().settings.pages.find((item: InfoPage) => item.slug === slug)
  return page ? copy(page) : null
}
