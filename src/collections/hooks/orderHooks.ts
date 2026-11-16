import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

import { isAdminRequest } from '@/collections/utils/access'
import { lockRow } from '@/collections/utils/db'
import { enqueueEmailJob } from '@/collections/utils/emailJobs'
import { FULFILLMENT_LABELS, isFulfillmentStatus, PAYMENT_LABELS } from '@/config/labels'
import { FULFILLMENT_TRANSITIONS } from '@/config/order-rules'
import { clock } from '@/lib/clock'
import type { FulfillmentStatus } from '@/types/order'
import { type AuditActor, type AuditEventInput, type OrderWriteContext, SWITCHABLE_STATUS_EMAILS } from '@/types/workflow'

type OrderDoc = Record<string, unknown> & { id: number; reference: string; fulfillmentStatus: string; isDemo?: boolean | null; saleRecordedAt?: string | null; items?: unknown; customer?: { email?: string | null } | null }

/** Fields an admin may change in the native form; everything else changes only through services. */
const ADMIN_EDITABLE: ReadonlySet<string> = new Set(['fulfillmentStatus', 'paymentStatus', 'needsPriceReview', 'adminNotes', 'version', 'updatedAt'])

export function workflowContext(req: PayloadRequest): OrderWriteContext {
  return req.context as OrderWriteContext
}

/** The authenticated admin from `req.user`; never taken from request data. */
export function adminActor(req: PayloadRequest): AuditActor {
  const user = req.user
  return { type: 'admin', userId: user?.id ?? null, label: user && 'email' in user && typeof user.email === 'string' ? user.email : 'ismeretlen admin' }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Every write path (services, admin form, REST/GraphQL) passes here:
 * - workflow writes (services) are already validated; only the version is bumped;
 * - admin edits may change status (valid transitions, not while a price decision is pending),
 *   payment state, the review flag and internal notes; the submission snapshot, prices, proposal and
 *   cancellation fields are immutable here; cancellation needs the dedicated action with a reason;
 * - concurrent edits are serialized with a row lock and stale saves are rejected.
 */
const SALE_FACTS: readonly string[] = ['paymentStatus', 'receivedByCustomerAt', 'paidAt', 'completedAt', 'saleRecordedAt']

/**
 * Sale integrity, for every write path (admin form, REST/GraphQL, services, background jobs):
 * - payment is recorded only by an explicit payment change (never inferred from dispatch or a status);
 * - "Teljesítve" requires the recorded customer receipt and payment, and stamps completion and the
 *   sale time (the moment all three became true);
 * - once completed, the handover facts are final, so a sale can never be counted twice or rewritten.
 */
function enforceSaleIntegrity(data: Record<string, unknown>, originalDoc: Record<string, unknown>): Record<string, unknown> {
  const now = clock.nowIso()
  if (originalDoc.fulfillmentStatus === 'completed') {
    for (const field of SALE_FACTS) {
      if (data[field] !== undefined && !same(data[field], originalDoc[field])) throw new APIError('Teljesített rendelés átvételi és fizetési adatai már nem módosíthatók.', 400)
    }
    return data
  }
  const next = { ...data }
  if (next.paymentStatus !== undefined && next.paymentStatus !== originalDoc.paymentStatus) next.paidAt = next.paymentStatus === 'paid' ? now : null
  const status = next.fulfillmentStatus ?? originalDoc.fulfillmentStatus
  if (status === 'completed') {
    if (!(next.receivedByCustomerAt ?? originalDoc.receivedByCustomerAt)) throw new APIError('Teljesítés előtt rögzítse, hogy az ügyfél átvette a terméket (Átadás rögzítése).', 400)
    if ((next.paymentStatus ?? originalDoc.paymentStatus) !== 'paid') throw new APIError('Teljesítés előtt rögzítse a fizetést (Fizetés: Kifizetve).', 400)
    next.completedAt = now
    next.saleRecordedAt = now
  }
  return next
}

export const protectOrder: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !originalDoc) return data
  const context = workflowContext(req)
  if (context.workflow) return { ...enforceSaleIntegrity(data, originalDoc), version: (Number(originalDoc.version) || 1) + 1 }
  if (!isAdminRequest(req)) throw new APIError('Nincs jogosultság.', 403)

  const locked = await lockRow(req, 'orders', originalDoc.id)
  if (locked && data.version !== undefined && Number(data.version) !== Number(locked.version)) {
    throw new APIError('A rendelést időközben módosították. Töltse újra az oldalt, és ismételje meg a módosítást.', 409)
  }
  for (const [field, value] of Object.entries(data)) {
    if (ADMIN_EDITABLE.has(field) || field === 'id' || field === 'createdAt') continue
    if (!same(value, originalDoc[field])) throw new APIError('Ez a mező itt nem módosítható (pillanatkép, ár, ajánlat vagy törlés). Használja a rendelési műveleteket.', 400)
  }
  const from = String(originalDoc.fulfillmentStatus)
  const to = typeof data.fulfillmentStatus === 'string' ? data.fulfillmentStatus : from
  if (to !== from) {
    if (to === 'cancelled') throw new APIError('Törléshez használja a „Rendelés törlése” műveletet (az indoklás kötelező).', 400)
    if (originalDoc.priceApprovalStatus === 'pending') throw new APIError('A teljesítés szünetel, amíg az ügyfél nem dönt az árváltozásról.', 409)
    if (!isFulfillmentStatus(from) || !isFulfillmentStatus(to) || !FULFILLMENT_TRANSITIONS[from].includes(to)) {
      throw new APIError(`Nem engedélyezett állapotváltás: ${isFulfillmentStatus(from) ? FULFILLMENT_LABELS[from] : from} → ${isFulfillmentStatus(to) ? FULFILLMENT_LABELS[to] : to}.`, 400)
    }
    const kind = (originalDoc.delivery as { kind?: string } | null)?.kind
    if (to === 'ready_for_collection' && kind !== 'collection') throw new APIError('Kiszállításos rendelés nem állítható „Átvehető” állapotba.', 400)
    if (to === 'dispatched' && kind !== 'delivery') throw new APIError('Személyes átvételes rendelés nem állítható „Kiszállítás alatt” állapotba.', 400)
  }
  return { ...enforceSaleIntegrity(data, originalDoc), version: (Number(originalDoc.version) || 1) + 1 }
}

/** Audit entries for a native admin edit, derived from the actual changes. */
function adminEditEvents(req: PayloadRequest, previous: OrderDoc, doc: OrderDoc): AuditEventInput[] {
  const actor = adminActor(req)
  const events: AuditEventInput[] = []
  if (previous.fulfillmentStatus !== doc.fulfillmentStatus) {
    const to = doc.fulfillmentStatus
    events.push({ type: 'status_changed', actor, message: `Állapot: ${isFulfillmentStatus(to) ? FULFILLMENT_LABELS[to] : to}.`, previousValue: previous.fulfillmentStatus, newValue: to })
  }
  if (previous.paymentStatus !== doc.paymentStatus) {
    const to = String(doc.paymentStatus)
    events.push({ type: 'payment_changed', actor, message: `Fizetés: ${PAYMENT_LABELS[to as keyof typeof PAYMENT_LABELS] ?? to}.`, previousValue: previous.paymentStatus, newValue: to })
  }
  if (Boolean(previous.needsPriceReview) !== Boolean(doc.needsPriceReview)) {
    events.push({ type: 'admin_edit', actor, message: 'Árellenőrzés jelölése módosítva.', previousValue: Boolean(previous.needsPriceReview), newValue: Boolean(doc.needsPriceReview) })
  }
  const notesBefore = Array.isArray(previous.adminNotes) ? previous.adminNotes.length : 0
  const notesAfter = Array.isArray(doc.adminNotes) ? doc.adminNotes.length : 0
  if (!same(previous.adminNotes, doc.adminNotes)) {
    // Note text stays on the order (admin-only); the audit keeps counts, not the content.
    events.push({ type: notesAfter > notesBefore ? 'note_added' : 'admin_edit', actor, message: 'Belső megjegyzések módosítva.', previousValue: { notes: notesBefore }, newValue: { notes: notesAfter } })
  }
  return events
}

type JsonValue = string | number | boolean | unknown[] | { [k: string]: unknown } | null

/** Payload json fields hold objects/arrays; scalars are wrapped as { value } (unwrapped when read). */
function toJson(value: unknown): JsonValue {
  if (value === undefined || value === null) return null
  const plain = JSON.parse(JSON.stringify(value)) as JsonValue
  return typeof plain === 'object' ? plain : { value: plain }
}

export async function writeAuditEvents(req: PayloadRequest, order: { id: number; reference: string }, events: AuditEventInput[]): Promise<void> {
  for (const event of events) {
    await req.payload.create({
      collection: 'order-events',
      data: {
        order: order.id,
        orderReference: order.reference,
        type: event.type,
        actorType: event.actor.type,
        actorUser: event.actor.type === 'admin' && typeof event.actor.userId === 'number' ? event.actor.userId : null,
        actorLabel: event.actor.label,
        message: event.message,
        previousValue: toJson(event.previousValue),
        newValue: toJson(event.newValue),
        reason: event.reason ?? null,
        proposal: event.proposalId ?? null,
        emailMessage: event.emailMessageId ?? null,
        at: event.at ?? clock.nowIso(),
      },
      req,
      overrideAccess: true,
    })
  }
}

type StatusEmailSettings = Partial<Record<FulfillmentStatus, boolean | null>>

/**
 * Central per-status email policy, applied to every status transition (admin form, API, services,
 * scheduler). Disabled transitions are recorded as skipped with the reason; nothing is re-sent when
 * preferences change later, and saving without a transition sends nothing.
 */
async function queueStatusEmail(req: PayloadRequest, doc: OrderDoc, from: string, to: string): Promise<AuditEventInput[]> {
  if (!isFulfillmentStatus(to) || !SWITCHABLE_STATUS_EMAILS.includes(to)) return []
  const customerEmail = doc.customer?.email
  if (!customerEmail) return []
  const settings = (await req.payload.findGlobal({ slug: 'notification-settings', req, overrideAccess: true, depth: 0 })) as { statusEmails?: StatusEmailSettings | null }
  const enabled = settings.statusEmails?.[to] === true
  const templateId = to === 'cancelled' ? 'cancelled-by-store' : 'fulfillment-update'
  const skipReason = enabled ? null : `Az automatikus e-mail ki van kapcsolva ennél az állapotnál: ${FULFILLMENT_LABELS[to]} (Értesítési beállítások).`
  const job = await enqueueEmailJob(req, {
    idempotencyKey: `${templateId}/${doc.reference}/${to}`,
    category: 'customer',
    to: customerEmail,
    replyTo: null,
    template: { id: templateId, orderReference: doc.reference, proposalId: null, contactMessageId: null, status: to },
    orderId: doc.id,
    isDemo: Boolean(doc.isDemo),
    status: enabled ? 'queued' : 'skipped',
    skipReason,
  })
  if (!job.created) return []
  const system: AuditActor = { type: 'system', label: 'értesítések' }
  if (!enabled) {
    console.info('[EMAIL – KIHAGYVA BEÁLLÍTÁS MIATT]', { orderReference: doc.reference, from, to, reason: skipReason })
    return [{ type: 'notification_skipped', actor: system, message: skipReason ?? 'Értesítés kihagyva.', emailMessageId: job.id }]
  }
  return [{ type: 'notification_queued', actor: system, message: `Állapotértesítés sorba állítva (${FULFILLMENT_LABELS[to]}).`, emailMessageId: job.id }]
}

type SaleLine = { lineId?: string | null; sku?: string | null; quantity?: number | null; brandId?: string | null; categoryIds?: unknown }

/**
 * Writes the sale entries once, in the transaction that recorded the sale: one per line for its brand
 * and one per assigned category, with the attribution fixed at submission. Demo orders never count.
 */
async function recordSale(req: PayloadRequest, order: OrderDoc): Promise<AuditEventInput[]> {
  const soldAt = typeof order.saleRecordedAt === 'string' ? order.saleRecordedAt : clock.nowIso()
  const existing = await req.payload.count({ collection: 'sale-entries', where: { order: { equals: order.id } }, req, overrideAccess: true })
  if (existing.totalDocs > 0) return []
  let units = 0
  for (const line of (Array.isArray(order.items) ? order.items : []) as SaleLine[]) {
    const quantity = Number(line.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) continue
    units += quantity
    const categories = Array.isArray(line.categoryIds) ? [...new Set(line.categoryIds.filter((id): id is string => typeof id === 'string' && id !== ''))] : []
    const targets = [...(line.brandId ? [{ dimension: 'brand' as const, key: line.brandId }] : []), ...categories.map((key: string) => ({ dimension: 'category' as const, key }))]
    for (const target of targets) {
      await req.payload.create({
        collection: 'sale-entries',
        data: { entryKey: `${order.id}/${line.lineId ?? line.sku}/${target.dimension}/${target.key}`, order: order.id, orderReference: order.reference, lineId: line.lineId ?? null, sku: line.sku ?? null, quantity, soldAt, ...target },
        req,
        overrideAccess: true,
      })
    }
  }
  return [{ type: 'sale_recorded', actor: { type: 'system', label: 'eladási statisztika' }, message: `Eladás rögzítve (${units} db) a heti népszerűséghez.`, newValue: { units, soldAt } }]
}

export const auditOrderChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  const context = workflowContext(req)
  const order = doc as OrderDoc
  if (operation === 'create') {
    await writeAuditEvents(req, order, context.auditEvents ?? [{ type: 'submitted', actor: { type: 'system', label: 'ismeretlen' }, message: 'Rendelés létrehozva.' }])
    return doc
  }
  const previous = previousDoc as OrderDoc
  const events = context.workflow ? [...(context.auditEvents ?? [])] : adminEditEvents(req, previous, order)
  const statusChanged = previous.fulfillmentStatus !== order.fulfillmentStatus
  if (statusChanged && !context.skipStatusNotification && !context.suppressSideEffects && !order.isDemo) {
    events.push(...(await queueStatusEmail(req, order, previous.fulfillmentStatus, order.fulfillmentStatus)))
  }
  if (!previous.saleRecordedAt && order.saleRecordedAt && !order.isDemo) events.push(...(await recordSale(req, order)))
  await writeAuditEvents(req, order, events)
  return doc
}
