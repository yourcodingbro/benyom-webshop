import 'server-only'

import { sampleData } from '@/sample'
import type { Brand, Category, Product } from '@/types/catalog'
import type { ContactMessage } from '@/types/contact'
import type { EmailLogEntry } from '@/types/email'
import type { Order } from '@/types/order'
import type { PriceChangeProposal } from '@/types/proposal'
import type { StoreSettings } from '@/types/settings'

/**
 * Isolated sample runtime store, private to `src/dto/`.
 *
 * - Lives in process memory only (one per server process / serverless instance).
 * - Starts as a deep clone of the immutable `sampleData`; source files are never written.
 * - Lost on restart, redeploy, or when another instance serves the request.
 * - Atomicity: every DTO mutation performs its check-and-set synchronously, with no
 *   `await` in between, so competing calls in one process cannot interleave.
 *   A Payload/PostgreSQL implementation must use transactions or conditional updates.
 */
export type SampleStore = {
  brands: Brand[]
  categories: Category[]
  products: Product[]
  orders: Order[]
  proposals: PriceChangeProposal[]
  settings: StoreSettings
  emailLog: EmailLogEntry[]
  contactMessages: ContactMessage[]
  startedAt: string
  /** Content fingerprint of the sample data this store was cloned from. */
  source: string
}

const STORE_KEY: unique symbol = Symbol.for('benyom.sampleStore')
type StoreGlobal = typeof globalThis & { [STORE_KEY]?: SampleStore }

// Content (not identity) comparison: duplicated module instances must never reset live state.
const SAMPLE_FINGERPRINT: string = JSON.stringify(sampleData)

function createStore(): SampleStore {
  return {
    brands: structuredClone(sampleData.brands),
    categories: structuredClone(sampleData.categories),
    products: structuredClone(sampleData.products),
    orders: structuredClone(sampleData.orders),
    proposals: structuredClone(sampleData.proposals),
    settings: structuredClone(sampleData.settings),
    emailLog: [],
    contactMessages: [],
    startedAt: new Date().toISOString(),
    source: SAMPLE_FINGERPRINT,
  }
}

export function sampleStore(): SampleStore {
  const holder = globalThis as StoreGlobal
  // Rebuild only when sample.ts content changed (development hot reload).
  if (holder[STORE_KEY]?.source !== SAMPLE_FINGERPRINT) holder[STORE_KEY] = createStore()
  return holder[STORE_KEY]
}

/** Restores the initial sample state (development tool and tests). */
export function resetSampleStore(): void {
  ;(globalThis as StoreGlobal)[STORE_KEY] = createStore()
}

/** DTO results are copies so callers can never mutate stored records by reference. */
export function copy<T>(value: T): T {
  return structuredClone(value)
}
