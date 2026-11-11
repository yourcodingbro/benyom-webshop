import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_LINE_QUANTITY } from '@/config/shop'
import { parseQuantity } from '@/lib/quantity'
import { cartLinesSchema } from '@/schemas/common'
import { orderService } from '@/services/orderService'
import { quoteService } from '@/services/quoteService'
import { buildCheckout, resetWorld } from '@/tests/helpers'

beforeEach(resetWorld)

describe('quantity validation', () => {
  it('accepts positive integers only in the quantity input', () => {
    expect(parseQuantity('3', MAX_LINE_QUANTITY)).toEqual({ value: 3 })
    expect(parseQuantity(' 2 ', MAX_LINE_QUANTITY)).toEqual({ value: 2 })
    for (const bad of ['', '0', '-1', '1.5', '2e1', 'két', `${MAX_LINE_QUANTITY + 1}`]) {
      expect(parseQuantity(bad, MAX_LINE_QUANTITY)).toHaveProperty('error')
    }
  })

  it('rejects invalid quantities on the server (quote and checkout)', async () => {
    for (const quantity of [0, -1, 1.5, MAX_LINE_QUANTITY + 1, '2']) {
      expect(cartLinesSchema.safeParse([{ sku: 'APL-IP17-256-01', quantity, quoteToken: null }]).success).toBe(false)
    }
    const input = await buildCheckout()
    const lines = input.lines as Record<string, unknown>[]
    const first = lines[0]
    if (first) first.quantity = 2.5
    const result = await orderService.placeOrder(input)
    expect(result.ok).toBe(false)
  })

  it('prices the requested quantity of the exact variant', async () => {
    const quote = await quoteService.quoteCart([{ sku: 'APL-IP17P-512-02', quantity: 3, quoteToken: null }])
    expect(quote.lines[0]?.lineTotal).toBe(3 * 679990)
  })
})
