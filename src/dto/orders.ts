import 'server-only'

import type { PayloadRequest, Where } from 'payload'

import { lockRow } from '@/collections/hooks/db'
import { isUniqueViolation, orderWriteContext, payloadClient, relationId, withTransaction } from '@/dto/payload'
import { assertAdminOrSystem, isAdminOrSystem } from '@/lib/authorization'
import { randomReference } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { verifyOrderAccessToken } from '@/lib/order-access'
import type { EmailMessage as EmailDoc, Order as OrderDoc, OrderEvent as OrderEventDoc } from '@/payload-types'
import type { AuthorizationContext } from '@/types/auth'
import type { Paginated } from '@/types/common'
import type { AgreedPricing, NotificationRecord, Order, OrderEvent, OrderPatch, OrderQuery, OrderSubmission } from '@/types/order'
import type { AuditEventInput, EmailJobStatus } from '@/types/workflow'

export type NewOrder = Omit<Order, 'id' | 'reference' | 'version' | 'createdAt' | 'updatedAt' | 'events' | 'notifications'> & {
  /** Audit entries written together with the order (e.g. submitted, price review flagged). */
  auditEvents: AuditEventInput[]
}

export type AddOrderResult = {
  order: Order
  /** false when the idempotency key matched an earlier identical submission. */
  created: boolean
}

/** Work that must commit together with an order change (e.g. queued notifications). */
export type InTransaction = (req: PayloadRequest, order: { id: number; reference: string; isDemo: boolean }) => Promise<void>

/** Typed values stored in Payload `json` fields. */
function json(value: object): OrderDoc['submission'] {
  return JSON.parse(JSON.stringify(value)) as OrderDoc['submission']
}

const CONFLICT_MESSAGE: string = 'A rendelést időközben módosították. Frissítse az oldalt, és próbálja újra.'

/** Audit json values: scalars are stored as { value } (see orderHooks). */
function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && 'value' in value) return (value as { value: unknown }).value
  return value ?? null
}

function toEvent(doc: OrderEventDoc): OrderEvent {
  return {
    id: String(doc.id),
    at: doc.at,
    type: doc.type,
    actor: doc.actorType,
    actorLabel: doc.actorLabel,
    message: doc.message,
    previousValue: unwrap(doc.previousValue),
    newValue: unwrap(doc.newValue),
    reason: doc.reason ?? null,
    proposalId: relationId(doc.proposal),
    emailMessageId: relationId(doc.emailMessage),
  }
}

function toNotification(doc: EmailDoc): NotificationRecord {
  return {
    id: String(doc.id),
    templateId: doc.templateId,
    recipientRole: doc.category === 'customer' ? 'customer' : 'store',
    status: doc.status as EmailJobStatus,
    attemptedAt: doc.lastAttemptAt ?? null,
    sentAt: doc.submittedAt ?? null,
    error: doc.lastError ?? doc.skipReason ?? null,
    proposalId: relationId(doc.proposal),
  }
}

function toOrder(doc: OrderDoc, events: OrderEvent[], notifications: NotificationRecord[]): Order {
  return {
    id: String(doc.id),
    reference: doc.reference,
    idempotencyKey: doc.idempotencyKey,
    submissionHash: doc.submissionHash ?? '',
    submission: doc.submission as OrderSubmission,
    agreed: doc.agreed as AgreedPricing,
    fulfillmentStatus: doc.fulfillmentStatus,
    paymentStatus: doc.paymentStatus,
    priceApprovalStatus: doc.priceApprovalStatus,
    needsPriceReview: Boolean(doc.needsPriceReview),
    adminNotes: (doc.adminNotes ?? []).map((note) => ({ at: note.at ?? doc.updatedAt, text: note.text })),
    events,
    notifications,
    cancellation: doc.cancellation?.reason ? { reason: doc.cancellation.reason, note: doc.cancellation.note ?? null, at: doc.cancellation.at ?? doc.updatedAt } : null,
    version: doc.version ?? 1,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isDemo: Boolean(doc.isDemo),
  }
}

/** Loads the order's audit trail (chronological) and email history alongside the document. */
async function hydrate(doc: OrderDoc, req?: PayloadRequest): Promise<Order> {
  const payload = req?.payload ?? (await payloadClient())
  const [events, emails] = await Promise.all([
    payload.find({ collection: 'order-events', where: { order: { equals: doc.id } }, sort: ['at', 'id'], pagination: false, depth: 0, overrideAccess: true, req }),
    payload.find({ collection: 'email-messages', where: { order: { equals: doc.id } }, sort: ['queuedAt', 'id'], pagination: false, depth: 0, overrideAccess: true, req }),
  ])
  return toOrder(doc, events.docs.map(toEvent), emails.docs.map(toNotification))
}

/** Denormalized, admin-searchable copies of the immutable submission snapshot. */
type SnapshotFields = Partial<Pick<OrderDoc, 'submittedAt' | 'items' | 'submittedTotals' | 'customer' | 'billingAddress' | 'shippingAddress' | 'delivery' | 'note' | 'terms'>>

function snapshotFields(input: NewOrder): SnapshotFields {
  const submission = input.submission
  return {
    submittedAt: submission.submittedAt,
    items: submission.lines.map((line) => ({
      lineId: line.lineId,
      productName: line.productName,
      sku: line.sku,
      colorHex: line.attributes.colorHex,
      attributes: [line.attributes.colorLabel ?? line.attributes.colorHex, line.attributes.storageGb ? `${line.attributes.storageGb} GB` : null, line.attributes.ramGb ? `${line.attributes.ramGb} GB RAM` : null, line.attributes.caseSizeMm ? `${line.attributes.caseSizeMm} mm` : null]
        .filter(Boolean)
        .join(', '),
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
      catalogUnitPrice: line.catalogUnitPrice,
    })),
    submittedTotals: submission.totals,
    customer: submission.customer,
    billingAddress: submission.billingAddress,
    shippingAddress: submission.shippingAddress ?? {},
    delivery: { methodId: submission.delivery.methodId, kind: submission.delivery.kind, name: submission.delivery.name, fee: submission.delivery.fee },
    note: submission.note,
    terms: submission.terms,
  }
}

/** Order document fields for a patch; audit entries travel in `req.context` (see orderWriteContext). */
function patchData(patch: OrderPatch, existingNotes: OrderDoc['adminNotes']): Partial<OrderDoc> {
  const data: Partial<OrderDoc> = {}
  if (patch.fulfillmentStatus) data.fulfillmentStatus = patch.fulfillmentStatus
  if (patch.paymentStatus) data.paymentStatus = patch.paymentStatus
  if (patch.priceApprovalStatus) data.priceApprovalStatus = patch.priceApprovalStatus
  if (patch.needsPriceReview !== undefined) data.needsPriceReview = patch.needsPriceReview
  if (patch.agreed) {
    data.agreed = json(patch.agreed)
    data.agreedTotals = patch.agreed.totals
  }
  if (patch.cancellation !== undefined) data.cancellation = patch.cancellation ?? { reason: null, note: null, at: null }
  if (patch.appendAdminNotes?.length) data.adminNotes = [...(existingNotes ?? []), ...patch.appendAdminNotes.map((note) => ({ at: note.at, text: note.text }))]
  return data
}

async function findDoc(where: Where, req?: PayloadRequest): Promise<OrderDoc | null> {
  const payload = req?.payload ?? (await payloadClient())
  const result = await payload.find({ collection: 'orders', where, limit: 1, depth: 0, overrideAccess: true, req })
  return result.docs[0] ?? null
}

/**
 * Atomic, idempotent order creation. A unique index on `idempotencyKey` decides concurrent
 * duplicates; the loser reads the winner's order. `inTransaction` runs in the same transaction
 * (queued notifications), so an order is never stored without them, nor they without the order.
 */
export async function addOrder(input: NewOrder, inTransaction?: InTransaction): Promise<AddOrderResult> {
  const existing = await findDoc({ idempotencyKey: { equals: input.idempotencyKey } })
  if (existing) {
    if (existing.submissionHash !== input.submissionHash) throw new AppError('CONFLICT', 'Ezzel a kérésazonosítóval már egy eltérő rendelést adtak le.')
    return { order: await hydrate(existing), created: false }
  }
  try {
    const order = await withTransaction(async (req: PayloadRequest): Promise<Order> => {
      let reference = randomReference()
      while (await findDoc({ reference: { equals: reference } }, req)) reference = randomReference()
      const { auditEvents, ...fields } = input
      const doc = await req.payload.create({
        collection: 'orders',
        data: {
          ...snapshotFields(input),
          submittedTotals: fields.submission.totals,
          delivery: { methodId: fields.submission.delivery.methodId, kind: fields.submission.delivery.kind, name: fields.submission.delivery.name, fee: fields.submission.delivery.fee },
          reference,
          idempotencyKey: fields.idempotencyKey,
          submissionHash: fields.submissionHash,
          submission: json(fields.submission),
          agreed: json(fields.agreed),
          agreedTotals: fields.agreed.totals,
          fulfillmentStatus: fields.fulfillmentStatus,
          paymentStatus: fields.paymentStatus,
          priceApprovalStatus: fields.priceApprovalStatus,
          needsPriceReview: fields.needsPriceReview,
          adminNotes: fields.adminNotes,
          cancellation: fields.cancellation ?? { reason: null, note: null, at: null },
          isDemo: fields.isDemo,
          version: 1,
        },
        req,
        overrideAccess: true,
        context: orderWriteContext(auditEvents, { suppressSideEffects: fields.isDemo }),
      })
      if (inTransaction) await inTransaction(req, { id: doc.id, reference: doc.reference, isDemo: Boolean(doc.isDemo) })
      return hydrate(doc, req)
    })
    return { order, created: true }
  } catch (error: unknown) {
    if (!isUniqueViolation(error)) throw error
    const winner = await findDoc({ idempotencyKey: { equals: input.idempotencyKey } })
    if (!winner) throw error
    if (winner.submissionHash !== input.submissionHash) throw new AppError('CONFLICT', 'Ezzel a kérésazonosítóval már egy eltérő rendelést adtak le.')
    return { order: await hydrate(winner), created: false }
  }
}

/** Returns null both for "not found" and "not allowed" so references cannot be probed. */
export async function getOrder(reference: string, auth: AuthorizationContext): Promise<Order | null> {
  const allowed = isAdminOrSystem(auth) || (auth.kind === 'order-access' && auth.reference === reference && verifyOrderAccessToken(reference, auth.accessToken))
  if (!allowed) return null
  const doc = await findDoc({ reference: { equals: reference } })
  return doc ? hydrate(doc) : null
}

/** Admin endpoints address orders by their Payload id. */
export async function getOrderById(id: string, auth: AuthorizationContext): Promise<Order | null> {
  assertAdminOrSystem(auth)
  const numeric = Number(id)
  if (!Number.isSafeInteger(numeric)) return null
  const doc = await findDoc({ id: { equals: numeric } })
  return doc ? hydrate(doc) : null
}

export async function getOrders(query: OrderQuery, auth: AuthorizationContext): Promise<Paginated<Order>> {
  assertAdminOrSystem(auth)
  const and: Where[] = []
  if (query.status) and.push({ fulfillmentStatus: { equals: query.status } })
  if (query.from) and.push({ createdAt: { greater_than_equal: query.from } })
  if (query.to) and.push({ createdAt: { less_than_equal: query.to } })
  if (query.search) {
    const term = query.search.trim()
    and.push({ or: [{ reference: { like: term } }, { 'customer.name': { like: term } }, { 'customer.email': { like: term } }] })
  }
  const payload = await payloadClient()
  const pageSize = query.pageSize ?? 20
  const result = await payload.find({ collection: 'orders', where: and.length ? { and } : {}, sort: '-createdAt', page: Math.max(query.page ?? 1, 1), limit: pageSize, depth: 0, overrideAccess: true })
  return {
    items: await Promise.all(result.docs.map((doc: OrderDoc) => hydrate(doc))),
    page: result.page ?? 1,
    pageSize,
    totalItems: result.totalDocs,
    totalPages: result.totalPages,
  }
}

/**
 * Applies a patch inside `req`'s transaction under a row lock. With `expectedVersion` the update only
 * applies if nobody changed the order in between (CONFLICT otherwise); null means a version-independent
 * append (notes). DTO-internal building block shared with the proposal DTO.
 */
export async function patchOrderInTransaction(req: PayloadRequest, reference: string, expectedVersion: number | null, patch: OrderPatch): Promise<OrderDoc> {
  const current = await findDoc({ reference: { equals: reference } }, req)
  if (!current) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  const locked = await lockRow(req, 'orders', current.id)
  if (!locked) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  if (expectedVersion !== null && Number(locked.version) !== expectedVersion) throw new AppError('CONFLICT', CONFLICT_MESSAGE)
  const fresh = await findDoc({ id: { equals: current.id } }, req)
  return req.payload.update({
    collection: 'orders',
    id: current.id,
    data: patchData(patch, fresh?.adminNotes ?? current.adminNotes),
    req,
    overrideAccess: true,
    depth: 0,
    context: orderWriteContext(patch.appendEvents ?? [], { skipStatusNotification: patch.skipStatusNotification, suppressSideEffects: Boolean(current.isDemo) }),
  })
}

/** Compare-and-set update with its audit entries (and optional extra work) in one transaction. */
export async function updateOrder(reference: string, expectedVersion: number | null, patch: OrderPatch, auth: AuthorizationContext, inTransaction?: InTransaction): Promise<Order> {
  assertAdminOrSystem(auth)
  return withTransaction(async (req: PayloadRequest): Promise<Order> => {
    const doc = await patchOrderInTransaction(req, reference, expectedVersion, patch)
    if (inTransaction) await inTransaction(req, { id: doc.id, reference: doc.reference, isDemo: Boolean(doc.isDemo) })
    return hydrate(doc, req)
  })
}

