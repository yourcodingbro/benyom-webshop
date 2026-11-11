import 'server-only'

import { QUOTE_TTL_HOURS } from '@/config/shop'
import { getVariantsBySku } from '@/dto/products'
import { effectiveOrderability, primaryImage, variantImages } from '@/lib/catalog'
import { addHours, clock } from '@/lib/clock'
import { hmac, safeEqual } from '@/lib/crypto'
import { multiplyHuf, sumHuf } from '@/lib/money'
import type { CartLineInput } from '@/schemas/common'
import type { CartQuote, QuotedLine } from '@/types/cart'
import type { VariantLookup } from '@/types/catalog'
import type { HufAmount, IsoDateTime } from '@/types/common'

export type { CartQuote, QuotedLine }

type QuotePayload = { sku: string; unitPrice: number; issuedAt: string; expiresAt: string }

type QuoteService = {
  quoteCart: (lines: CartLineInput[]) => Promise<CartQuote>
  issueQuote: (sku: string, unitPrice: HufAmount) => { token: string; expiresAt: IsoDateTime }
  verifyQuote: (token: string, sku: string) => QuotePayload | null
}

function encode(payload: QuotePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${hmac(`quote:${body}`)}`
}

function isQuotePayload(value: unknown): value is QuotePayload {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.sku === 'string' &&
    typeof record.unitPrice === 'number' &&
    Number.isSafeInteger(record.unitPrice) &&
    typeof record.issuedAt === 'string' &&
    typeof record.expiresAt === 'string'
  )
}

/**
 * Server-issued price quotes. The browser stores the opaque signed token next to a cart
 * line; prices sent by the browser are never trusted. A valid quote preserves the price the
 * customer saw (even if the catalog price later rose); a lower current price always wins.
 */
export const quoteService: QuoteService = {
  issueQuote(sku: string, unitPrice: HufAmount): { token: string; expiresAt: IsoDateTime } {
    const issuedAt = clock.nowIso()
    const expiresAt = addHours(issuedAt, QUOTE_TTL_HOURS)
    return { token: encode({ sku, unitPrice, issuedAt, expiresAt }), expiresAt }
  },

  verifyQuote(token: string, sku: string): QuotePayload | null {
    const [body, signature] = token.split('.')
    if (!body || !signature || !safeEqual(hmac(`quote:${body}`), signature)) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
      return null
    }
    if (!isQuotePayload(parsed) || parsed.sku !== sku) return null
    const now = clock.nowIso()
    if (parsed.expiresAt <= now || parsed.issuedAt > now) return null
    return parsed
  },

  async quoteCart(lines: CartLineInput[]): Promise<CartQuote> {
    const lookups = await getVariantsBySku(lines.map((line: CartLineInput) => line.sku))
    const bySku = new Map(lookups.map((lookup: VariantLookup) => [lookup.variant.sku, lookup]))
    const quoted: QuotedLine[] = lines.map((line: CartLineInput) => {
      const lookup = bySku.get(line.sku)
      if (!lookup) {
        return {
          sku: line.sku, quantity: line.quantity, status: 'not_found', orderability: null, productId: null,
          productName: 'Ismeretlen termék', productSlug: null, brandName: '', attributes: null, imageUrl: null, imageAlt: '',
          unitPrice: 0, catalogUnitPrice: 0, lineTotal: 0, priceSource: 'catalog', quoteToken: null, quoteExpiresAt: null,
        }
      }
      const { product, variant, brand } = lookup
      const orderability = effectiveOrderability(product, variant)
      const existing = line.quoteToken ? quoteService.verifyQuote(line.quoteToken, variant.sku) : null
      const keepQuote = existing !== null && existing.unitPrice <= variant.price
      const fresh = keepQuote ? null : quoteService.issueQuote(variant.sku, variant.price)
      const unitPrice = keepQuote && existing ? existing.unitPrice : variant.price
      const image = variantImages(product, variant)[0] ?? primaryImage(product)
      const available = orderability === 'preorderable'
      return {
        sku: variant.sku,
        quantity: line.quantity,
        status: available ? 'ok' : 'unavailable',
        orderability,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        brandName: brand.name,
        attributes: variant.attributes,
        imageUrl: image?.url ?? null,
        imageAlt: image?.alt ?? product.name,
        unitPrice,
        catalogUnitPrice: variant.price,
        lineTotal: available ? multiplyHuf(unitPrice, line.quantity) : 0,
        priceSource: keepQuote ? 'quote' : 'catalog',
        quoteToken: keepQuote && line.quoteToken ? line.quoteToken : (fresh?.token ?? null),
        quoteExpiresAt: keepQuote && existing ? existing.expiresAt : (fresh?.expiresAt ?? null),
      }
    })
    return {
      lines: quoted,
      itemsTotal: sumHuf(quoted.map((line: QuotedLine) => line.lineTotal)),
      hasUnavailable: quoted.some((line: QuotedLine) => line.status !== 'ok'),
      quotedAt: clock.nowIso(),
    }
  },
}
