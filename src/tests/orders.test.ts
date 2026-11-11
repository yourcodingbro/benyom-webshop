import { beforeEach, describe, expect, it } from 'vitest'

import { getOrder, getOrders } from '@/dto/orders'
import { getAllProducts, updateProduct } from '@/dto/products'
import { HOUR_MS, clock } from '@/lib/clock'
import { setEmailFailureMode } from '@/lib/dev-simulation'
import { createOrderAccessToken } from '@/lib/order-access'
import { orderService } from '@/services/orderService'
import { quoteService } from '@/services/quoteService'
import { ADMIN, buildCheckout, placeTestOrder, resetWorld } from '@/tests/helpers'

beforeEach(resetWorld)

async function setPrice(sku: string, price: number): Promise<void> {
  const product = (await getAllProducts(ADMIN)).find((item) => item.variants.some((variant) => variant.sku === sku))
  if (!product) throw new Error('sku missing')
  await updateProduct(product.id, { variants: product.variants.map((variant) => (variant.sku === sku ? { ...variant, price } : variant)) }, ADMIN)
}

describe('pricing and snapshot integrity', () => {
  it('computes exact integer totals server-side and ignores browser prices', async () => {
    const input = await buildCheckout(['APL-IP17-256-01', 'SAM-A57-128-01'], { deliveryMethodId: 'hazhozszallitas', shippingAddress: { postalCode: '1111', city: 'Budapest', street: 'Fő utca 1.', country: 'HU' } })
    const lines = input.lines as Record<string, unknown>[]
    for (const line of lines) line.unitPrice = 1
    const result = await orderService.placeOrder(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = await getOrder(result.reference, ADMIN)
    expect(order?.submission.totals).toEqual({ itemsTotal: 449990 + 169990, deliveryFee: 2990, grandTotal: 449990 + 169990 + 2990, currency: 'HUF' })
    expect(order?.paymentStatus).toBe('unpaid')
    expect(order?.fulfillmentStatus).toBe('received')
  })

  it('keeps the submission snapshot unchanged when the catalog changes', async () => {
    const order = await placeTestOrder()
    await setPrice('APL-IP17-256-01', 499990)
    const reloaded = await getOrder(order.reference, ADMIN)
    expect(reloaded?.submission).toEqual(order.submission)
    expect(reloaded?.submission.lines[0]?.attributes.colorHex).toBe('#1C1C1E')
  })

  it('preserves a valid quoted price after a catalog increase and flags price review', async () => {
    const input = await buildCheckout(['APL-IP17-256-01'])
    await setPrice('APL-IP17-256-01', 479990)
    const result = await orderService.placeOrder(input)
    if (!result.ok) throw new Error(result.message)
    const order = await getOrder(result.reference, ADMIN)
    expect(order?.submission.lines[0]?.unitPrice).toBe(449990)
    expect(order?.submission.lines[0]?.catalogUnitPrice).toBe(479990)
    expect(order?.needsPriceReview).toBe(true)
  })

  it('uses the catalog price for expired or tampered quotes, and a lower catalog price always wins', async () => {
    const { token } = quoteService.issueQuote('APL-IP17-256-01', 449990)
    clock.advance(73 * HOUR_MS)
    expect(quoteService.verifyQuote(token, 'APL-IP17-256-01')).toBeNull()
    const forged = `${Buffer.from(JSON.stringify({ sku: 'APL-IP17-256-01', unitPrice: 1, issuedAt: clock.nowIso(), expiresAt: '2099-01-01T00:00:00.000Z' })).toString('base64url')}.${token.split('.')[1]}`
    expect(quoteService.verifyQuote(forged, 'APL-IP17-256-01')).toBeNull()
    const fresh = quoteService.issueQuote('APL-IP17-256-01', 449990)
    expect(quoteService.verifyQuote(fresh.token, 'APL-IP17-256-02')).toBeNull()
    await setPrice('APL-IP17-256-01', 399990)
    const quote = await quoteService.quoteCart([{ sku: 'APL-IP17-256-01', quantity: 2, quoteToken: fresh.token }])
    expect(quote.lines[0]?.unitPrice).toBe(399990)
    expect(quote.itemsTotal).toBe(799980)
  })
})

describe('order validation and orderability', () => {
  it('rejects unavailable variants, unknown fees and missing shipping address', async () => {
    const unavailable = await orderService.placeOrder(await buildCheckout(['APL-IP17P-1TB-02']))
    expect(unavailable.ok).toBe(false)
    const unknownFee = await orderService.placeOrder(await buildCheckout(undefined, { deliveryMethodId: 'csomagautomata' }))
    expect(unknownFee.ok).toBe(false)
    if (!unknownFee.ok) expect(unknownFee.message).toMatch(/nincs meghatározott díja/)
    const noAddress = await orderService.placeOrder(await buildCheckout(undefined, { deliveryMethodId: 'hazhozszallitas' }))
    expect(noAddress.ok).toBe(false)
    const noTerms = await orderService.placeOrder(await buildCheckout(undefined, { termsAccepted: false }))
    expect(noTerms.ok).toBe(false)
    if (!noTerms.ok) expect(noTerms.fieldErrors.termsAccepted).toMatch(/ÁSZF/)
  })

  it('does not require or store a shipping address for collection', async () => {
    const order = await placeTestOrder(undefined, { shippingAddress: { postalCode: '1111', city: 'X', street: 'Y 1.', country: 'HU' } })
    expect(order.submission.shippingAddress).toBeNull()
    expect(order.submission.delivery.fee).toBe(0)
    expect(order.submission.terms.termsVersion).toBe('MINTA-ASZF-2026-11')
  })
})

describe('idempotency and authorization', () => {
  it('returns the same order for a repeated idempotency key and rejects a different payload', async () => {
    const input = await buildCheckout()
    const first = await orderService.placeOrder(input)
    const second = await orderService.placeOrder(input)
    expect(first.ok && second.ok && first.reference === second.reference).toBe(true)
    if (second.ok) expect(second.created).toBe(false)
    const conflicting = await orderService.placeOrder({ ...input, note: 'más' })
    expect(conflicting.ok).toBe(false)
    expect((await getOrders({}, ADMIN)).items.filter((order) => order.idempotencyKey === input.idempotencyKey)).toHaveLength(1)
  })

  it('never exposes orders without a valid access token or admin context', async () => {
    const order = await placeTestOrder()
    expect(await getOrder(order.reference, { kind: 'anonymous' })).toBeNull()
    expect(await getOrder(order.reference, { kind: 'order-access', reference: order.reference, accessToken: 'hamis' })).toBeNull()
    const otherToken = createOrderAccessToken('BNY-MNTA-0001')
    expect(await getOrder(order.reference, { kind: 'order-access', reference: order.reference, accessToken: otherToken })).toBeNull()
    expect(await orderService.getOrderForCustomer(order.reference, createOrderAccessToken(order.reference))).not.toBeNull()
    await expect(getOrders({}, { kind: 'anonymous' })).rejects.toThrow()
    await expect(orderService.updateFulfillmentStatus({ reference: order.reference, status: 'confirmed', expectedVersion: order.version }, { kind: 'anonymous' })).rejects.toThrow()
    expect(order.reference).toMatch(/^BNY-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/)
  })

  it('keeps the order when notification sending fails', async () => {
    setEmailFailureMode({ kind: 'fail-all' })
    const order = await placeTestOrder()
    expect(order.notifications).toHaveLength(2)
    expect(order.notifications.every((record) => record.status === 'failed')).toBe(true)
  })

  it('enforces fulfillment transitions and optimistic concurrency', async () => {
    const order = await placeTestOrder()
    await expect(orderService.updateFulfillmentStatus({ reference: order.reference, status: 'completed', expectedVersion: order.version }, ADMIN)).rejects.toThrow(/Nem engedélyezett/)
    const confirmed = await orderService.updateFulfillmentStatus({ reference: order.reference, status: 'confirmed', expectedVersion: order.version }, ADMIN)
    await expect(orderService.updateFulfillmentStatus({ reference: order.reference, status: 'procurement_in_progress', expectedVersion: order.version }, ADMIN)).rejects.toThrow(/időközben/)
    const procuring = await orderService.updateFulfillmentStatus({ reference: order.reference, status: 'procurement_in_progress', expectedVersion: confirmed.version }, ADMIN)
    await expect(orderService.updateFulfillmentStatus({ reference: order.reference, status: 'dispatched', expectedVersion: procuring.version }, ADMIN)).rejects.toThrow(/Személyes átvételes/)
  })
})
