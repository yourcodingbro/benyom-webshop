import { randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { getOrder } from '@/dto/orders'
import { clock } from '@/lib/clock'
import type { User } from '@/payload-types'
import { orderService } from '@/services/orderService'
import { quoteService } from '@/services/quoteService'
import type { AuthorizationContext } from '@/types/auth'
import type { Order } from '@/types/order'

export const ADMIN: AuthorizationContext = { kind: 'admin', adminId: 'teszt-admin', label: 'teszt-admin' }
export const START: Date = new Date('2026-11-11T09:00:00.000Z')

export async function testPayload(): Promise<Payload> {
  return getPayload({ config })
}

const EMAIL_ENV = ['EMAIL_MODE', 'RESEND_API_KEY', 'EMAIL_FROM', 'CONTACT_EMAIL'] as const

/** Live-email configuration for tests; the Resend SDK itself is mocked (src/tests/resend-mock.ts). */
export function enableResendMode(): void {
  Object.assign(process.env, { EMAIL_MODE: 'resend', RESEND_API_KEY: 're_test_0123456789abcdefghijklmnopqrstuv', EMAIL_FROM: 'Webshop <rendeles@example.com>', CONTACT_EMAIL: 'bolt@example.com' })
}

/**
 * Restores the seeded snapshot (catalog, settings, demo orders, test admin) into every table: fast,
 * isolated tests on a real database. Identity sequences continue after the restored ids.
 */
export async function resetWorld(): Promise<void> {
  const payload = await testPayload()
  const db = payload.db.drizzle
  const tables = (await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'test_snapshot'`)).rows as { table_name: string }[]
  const names = tables.map((row) => `public."${row.table_name}"`).join(", ")
  const sequences = (await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`)).rows as { table_name: string; column_name: string }[]
  // One statement batch on one connection; FK/user triggers are paused only for this restore (test database).
  const statements = [
    "SET session_replication_role = replica",
    `TRUNCATE ${names} RESTART IDENTITY CASCADE`,
    ...tables.map(({ table_name: table }) => `INSERT INTO public."${table}" SELECT * FROM test_snapshot."${table}"`),
    ...sequences.map(({ table_name: table, column_name: column }) => `SELECT setval(pg_get_serial_sequence('public."${table}"', '${column}'), COALESCE((SELECT MAX("${column}") FROM public."${table}"), 0) + 1, false)`),
    "SET session_replication_role = origin",
  ]
  await db.execute(sql.raw(statements.join(';\n')))
  for (const name of EMAIL_ENV) process.env[name] = name === 'EMAIL_MODE' ? 'log' : ''
  clock.set(START)
}

export async function adminUser(): Promise<User> {
  const payload = await testPayload()
  const result = await payload.find({ collection: 'users', where: { email: { equals: 'admin@teszt.hu' } }, limit: 1, overrideAccess: true })
  const user = result.docs[0]
  if (!user) throw new Error('test admin missing')
  return { ...user, collection: 'users' } as User
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

export async function reload(order: Order): Promise<Order> {
  const latest = await getOrder(order.reference, ADMIN)
  if (!latest) throw new Error('order missing')
  return latest
}
