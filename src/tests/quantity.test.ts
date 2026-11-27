import { beforeEach, describe, expect, it } from 'vitest'

import { TECHNICAL_LIMITS } from '@/config/shop'
import { cartLimitError } from '@/lib/cart-limits'
import { parseQuantity } from '@/lib/quantity'
import { cartLinesSchema } from '@/schemas/common'
import { orderService } from '@/services/orderService'
import { quoteService } from '@/services/quoteService'
import { buildCheckout, resetWorld, testPayload } from '@/tests/helpers'

beforeEach(resetWorld)

/** Default of Áruház beállítások → Üzleti szabályok → Max. darab tételenként (seed and migration). */
const MAX_LINE_QUANTITY = 5

describe('quantity validation', () => {
  it('accepts positive integers only in the quantity input', () => {
    expect(parseQuantity('3', MAX_LINE_QUANTITY)).toEqual({ value: 3 })
    expect(parseQuantity(' 2 ', MAX_LINE_QUANTITY)).toEqual({ value: 2 })
    for (const bad of ['', '0', '-1', '1.5', '2e1', 'két', `${MAX_LINE_QUANTITY + 1}`]) {
      expect(parseQuantity(bad, MAX_LINE_QUANTITY)).toHaveProperty('error')
    }
  })

  it('rejects invalid quantities on the server (quote and checkout)', async () => {
    // The static schema only applies the technical ceiling; the configured limit is checked by the services.
    for (const quantity of [0, -1, 1.5, TECHNICAL_LIMITS.maxLineQuantity + 1, '2']) {
      expect(cartLinesSchema.safeParse([{ sku: 'APL-IP17-256-01', quantity, quoteToken: null }]).success).toBe(false)
    }
    const overLimit = await buildCheckout()
    const overLines = overLimit.lines as Record<string, unknown>[]
    if (overLines[0]) overLines[0].quantity = MAX_LINE_QUANTITY + 1
    expect(await orderService.placeOrder(overLimit)).toMatchObject({ ok: false, message: expect.stringMatching(/legfeljebb 5 darab/) })
    const input = await buildCheckout()
    const lines = input.lines as Record<string, unknown>[]
    const first = lines[0]
    if (first) first.quantity = 2.5
    const result = await orderService.placeOrder(input)
    expect(result.ok).toBe(false)
  })

  it('applies the configured business limits (Üzleti szabályok) to quotes and orders', async () => {
    const payload = await testPayload()
    await payload.updateGlobal({ slug: 'store-settings', data: { limits: { maxLineQuantity: 2, maxCartLines: 1, priceChangeResponseHours: 24, priceChangeReminderHours: 24 } }, overrideAccess: true })
    const limits = { maxLineQuantity: 2, maxCartLines: 1 }
    expect(cartLimitError([{ quantity: 2 }], limits)).toBeNull()
    expect(cartLimitError([{ quantity: 3 }], limits)).toMatch(/legfeljebb 2 darab/)
    expect(cartLimitError([{ quantity: 1 }, { quantity: 1 }], limits)).toMatch(/Legfeljebb 1 tétel/)
    const input = await buildCheckout()
    const lines = input.lines as Record<string, unknown>[]
    if (lines[0]) lines[0].quantity = 3
    expect(await orderService.placeOrder(input)).toMatchObject({ ok: false, message: expect.stringMatching(/legfeljebb 2 darab/) })
    if (lines[0]) lines[0].quantity = 2
    expect((await orderService.placeOrder({ ...input, idempotencyKey: crypto.randomUUID() })).ok).toBe(true)
    // Out-of-range values are rejected by the admin validation (server side), never stored.
    await expect(payload.updateGlobal({ slug: 'store-settings', data: { limits: { maxLineQuantity: 0, maxCartLines: 1, priceChangeResponseHours: 24, priceChangeReminderHours: 24 } }, overrideAccess: true })).rejects.toThrow()
    await expect(payload.updateGlobal({ slug: 'store-settings', data: { limits: { maxLineQuantity: 2.5, maxCartLines: 1, priceChangeResponseHours: 24, priceChangeReminderHours: 24 } }, overrideAccess: true })).rejects.toThrow()
  })

  it('prices the requested quantity of the exact variant', async () => {
    const quote = await quoteService.quoteCart([{ sku: 'APL-IP17P-512-02', quantity: 3, quoteToken: null }])
    expect(quote.lines[0]?.lineTotal).toBe(3 * 679990)
  })
})
