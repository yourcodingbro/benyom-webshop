import type { Orderability, VariantAttributes } from '@/types/catalog'
import type { HufAmount, IsoDateTime } from '@/types/common'

/** One server-priced cart line. Browser-safe: contains no secrets (the quote token is an opaque signed value). */
export type QuotedLine = {
  sku: string
  quantity: number
  status: 'ok' | 'unavailable' | 'not_found'
  orderability: Orderability | null
  productId: string | null
  productName: string
  productSlug: string | null
  brandName: string
  attributes: VariantAttributes | null
  imageUrl: string | null
  imageAlt: string
  unitPrice: HufAmount
  catalogUnitPrice: HufAmount
  lineTotal: HufAmount
  priceSource: 'quote' | 'catalog'
  quoteToken: string | null
  quoteExpiresAt: IsoDateTime | null
}

export type CartQuote = {
  lines: QuotedLine[]
  itemsTotal: HufAmount
  hasUnavailable: boolean
  quotedAt: IsoDateTime
}

/** What the browser persists in localStorage. Prices shown come from the last server quote. */
export type StoredCartLine = {
  sku: string
  quantity: number
  quoteToken: string | null
}
