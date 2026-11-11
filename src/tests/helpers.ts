import { randomUUID } from 'node:crypto'

import { getOrder } from '@/dto/orders'
import { resetSampleStore } from '@/dto/sample-store'
import { clock } from '@/lib/clock'
import { setEmailFailureMode } from '@/lib/dev-simulation'
import { orderService } from '@/services/orderService'
import { quoteService } from '@/services/quoteService'
import type { AuthorizationContext } from '@/types/auth'
import type { Order } from '@/types/order'

export const ADMIN: AuthorizationContext = { kind: 'admin', adminId: 'teszt-admin' }
export const START: Date = new Date('2026-11-11T09:00:00.000Z')

export function resetWorld(): void {
  resetSampleStore()
  clock.set(START)
  setEmailFailureMode({ kind: 'none' })
}

type CheckoutOverrides = Record<string, unknown>

export async function buildCheckout(skus: string[] = ['APL-IP17-256-01'], overrides: CheckoutOverrides = {}): Promise<Record<string, unknown>> {
  const quote = await quoteService.quoteCart(skus.map((sku: string) => ({ sku, quantity: 1, quoteToken: null })))
  return {
    idempotencyKey: randomUUID(),
    lines: quote.lines.map((line) => ({ sku: line.sku, quantity: line.quantity, quoteToken: line.quoteToken })),
    customer: { name: 'Teszt Elek', email: 'teszt@example.com', phone: '+36 30 123 4567', companyName: null, taxNumber: null },
    billingAddress: { postalCode: '1111', city: 'Budapest', street: 'Teszt utca 1.', country: 'HU' },
    deliveryMethodId: 'szemelyes-atvetel',
    shippingAddress: null,
    note: null,
    termsAccepted: true,
    privacyAccepted: true,
    ...overrides,
  }
}

export async function placeTestOrder(skus?: string[], overrides?: CheckoutOverrides): Promise<Order> {
  const result = await orderService.placeOrder(await buildCheckout(skus, overrides))
  if (!result.ok) throw new Error(`placeOrder failed: ${result.message} ${JSON.stringify(result.fieldErrors)}`)
  const order = await getOrder(result.reference, ADMIN)
  if (!order) throw new Error('order missing')
  return order
}
