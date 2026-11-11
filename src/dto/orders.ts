import 'server-only'

import { assertAdminOrSystem, isAdminOrSystem } from '@/lib/authorization'
import { searchKey } from '@/lib/catalog'
import { clock } from '@/lib/clock'
import { randomReference } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { verifyOrderAccessToken } from '@/lib/order-access'
import { copy, sampleStore } from '@/dto/sample-store'
import type { AuthorizationContext } from '@/types/auth'
import type { Paginated } from '@/types/common'
import type { Order, OrderPatch, OrderQuery } from '@/types/order'

export type NewOrder = Omit<Order, 'id' | 'reference' | 'version' | 'createdAt' | 'updatedAt'>

export type AddOrderResult = {
  order: Order
  /** false when the idempotency key matched an earlier identical submission. */
  created: boolean
}

/** DTO-internal: applies a patch to a stored order record in place. */
export function applyOrderPatch(order: Order, patch: OrderPatch, now: string): void {
  if (patch.fulfillmentStatus) order.fulfillmentStatus = patch.fulfillmentStatus
  if (patch.paymentStatus) order.paymentStatus = patch.paymentStatus
  if (patch.priceApprovalStatus) order.priceApprovalStatus = patch.priceApprovalStatus
  if (patch.needsPriceReview !== undefined) order.needsPriceReview = patch.needsPriceReview
  if (patch.agreed) order.agreed = copy(patch.agreed)
  if (patch.cancellation !== undefined) order.cancellation = copy(patch.cancellation)
  if (patch.appendEvents) order.events.push(...copy(patch.appendEvents))
  if (patch.appendNotifications) order.notifications.push(...copy(patch.appendNotifications))
  if (patch.appendAdminNotes) order.adminNotes.push(...copy(patch.appendAdminNotes))
  // Pure appends (notifications, notes, events) cannot conflict, so only state changes bump the version.
  const changesState = [patch.fulfillmentStatus, patch.paymentStatus, patch.priceApprovalStatus, patch.needsPriceReview, patch.agreed, patch.cancellation].some(
    (value: unknown) => value !== undefined,
  )
  if (changesState) order.version += 1
  order.updatedAt = now
}

/**
 * Atomic, idempotent order creation. The idempotency key and submission hash are
 * checked and the order inserted in one synchronous step.
 * Payload later: unique index on `idempotencyKey` + insert-or-fetch inside a transaction.
 */
export async function addOrder(input: NewOrder): Promise<AddOrderResult> {
  const store = sampleStore()
  const existing = store.orders.find((order: Order) => order.idempotencyKey === input.idempotencyKey)
  if (existing) {
    if (existing.submissionHash !== input.submissionHash) {
      throw new AppError('CONFLICT', 'Ezzel a kérésazonosítóval már egy eltérő rendelést adtak le.')
    }
    return { order: copy(existing), created: false }
  }
  let reference = randomReference()
  while (store.orders.some((order: Order) => order.reference === reference)) reference = randomReference()
  const now = clock.nowIso()
  const order: Order = { ...copy(input), id: `order-${reference}`, reference, version: 1, createdAt: now, updatedAt: now }
  store.orders.push(order)
  return { order: copy(order), created: true }
}

/**
 * Returns null both for "not found" and "not allowed" so references cannot be probed.
 */
export async function getOrder(reference: string, auth: AuthorizationContext): Promise<Order | null> {
  const order = sampleStore().orders.find((item: Order) => item.reference === reference)
  if (!order) return null
  if (isAdminOrSystem(auth)) return copy(order)
  if (auth.kind === 'order-access' && auth.reference === reference && verifyOrderAccessToken(reference, auth.accessToken)) {
    return copy(order)
  }
  return null
}

export async function getOrders(query: OrderQuery, auth: AuthorizationContext): Promise<Paginated<Order>> {
  assertAdminOrSystem(auth)
  const search = query.search ? searchKey(query.search) : null
  const filtered = sampleStore()
    .orders.filter((order: Order) => {
      if (query.status && order.fulfillmentStatus !== query.status) return false
      if (query.from && order.createdAt < query.from) return false
      if (query.to && order.createdAt > query.to) return false
      if (search) {
        const haystack = searchKey(`${order.reference} ${order.submission.customer.name} ${order.submission.customer.email}`)
        if (!haystack.includes(search)) return false
      }
      return true
    })
    .sort((a: Order, b: Order) => b.createdAt.localeCompare(a.createdAt))
  const pageSize = query.pageSize ?? 20
  const page = Math.max(query.page ?? 1, 1)
  return {
    items: copy(filtered.slice((page - 1) * pageSize, page * pageSize)),
    page,
    pageSize,
    totalItems: filtered.length,
    totalPages: Math.ceil(filtered.length / pageSize),
  }
}

/**
 * Compare-and-set update. With `expectedVersion` the update only applies if nobody changed
 * the order in between (CONFLICT otherwise). Pass null for append-only updates such as
 * notification records, which are safe regardless of ordering.
 */
export async function updateOrder(
  reference: string,
  expectedVersion: number | null,
  patch: OrderPatch,
  auth: AuthorizationContext,
): Promise<Order> {
  assertAdminOrSystem(auth)
  const order = sampleStore().orders.find((item: Order) => item.reference === reference)
  if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  if (expectedVersion !== null && order.version !== expectedVersion) {
    throw new AppError('CONFLICT', 'A rendelést időközben módosították. Frissítse az oldalt, és próbálja újra.')
  }
  applyOrderPatch(order, patch, clock.nowIso())
  return copy(order)
}
