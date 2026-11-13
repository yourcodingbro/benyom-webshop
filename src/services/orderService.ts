import 'server-only'

import type { PayloadRequest } from 'payload'

import { FULFILLMENT_LABELS } from '@/config/labels'
import { FULFILLMENT_TRANSITIONS } from '@/config/order-rules'
import { getDueEmailJobIds } from '@/dto/email-log'
import { addOrder, getOrder, getOrderById, updateOrder } from '@/dto/orders'
import { getActiveProposal, resolveProposal } from '@/dto/price-change-proposals'
import { getStoreSettings } from '@/dto/settings'
import { actorOf } from '@/lib/audit'
import { assertAdminOrSystem } from '@/lib/authorization'
import { clock } from '@/lib/clock'
import { canonicalJson, sha256 } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { sumHuf } from '@/lib/money'
import { createOrderAccessToken } from '@/lib/order-access'
import { checkoutSchema } from '@/schemas/checkout'
import { notificationService } from '@/services/notificationService'
import { quoteService } from '@/services/quoteService'
import type { AuthorizationContext } from '@/types/auth'
import type { QuotedLine } from '@/types/cart'
import type { FieldErrors, HufAmount } from '@/types/common'
import type { FulfillmentStatus, Order, OrderLineSnapshot, OrderPatch, OrderTotals } from '@/types/order'
import type { DeliveryMethod } from '@/types/settings'
import type { AuditEventInput } from '@/types/workflow'

export type PlaceOrderResult =
  | { ok: true; reference: string; accessToken: string; created: boolean }
  | { ok: false; message: string; fieldErrors: FieldErrors }

export type UpdateStatusInput = {
  reference: string
  status: FulfillmentStatus
  expectedVersion: number
}

/** Identify the order by public reference or (admin UI) by Payload id. */
export type CancelOrderInput = {
  reference?: string
  orderId?: string
  /** Required reason, stored on the order and in the audit trail. */
  note: string
  expectedVersion: number
}

type OrderService = {
  placeOrder: (input: unknown) => Promise<PlaceOrderResult>
  getOrderForCustomer: (reference: string, accessToken: string) => Promise<Order | null>
  updateFulfillmentStatus: (input: UpdateStatusInput, auth: AuthorizationContext) => Promise<Order>
  cancelOrder: (input: CancelOrderInput, auth: AuthorizationContext) => Promise<Order>
  addAdminNote: (reference: string, text: string, auth: AuthorizationContext) => Promise<Order>
}

const MIN_REASON_LENGTH: number = 3

/** Throws unless the method can be ordered right now; unknown fees are never treated as zero. */
export function resolveDeliveryFee(method: DeliveryMethod | undefined): HufAmount {
  if (!method || !method.enabled) throw new AppError('VALIDATION', 'A választott szállítási mód nem elérhető.', { deliveryMethodId: 'Válasszon elérhető szállítási módot.' })
  switch (method.fee.kind) {
    case 'free':
      return 0
    case 'fixed':
      return method.fee.amount
    case 'unknown':
      throw new AppError('VALIDATION', 'Ennek a szállítási módnak még nincs meghatározott díja, ezért nem választható.', {
        deliveryMethodId: 'Ennek a szállítási módnak még nincs meghatározott díja.',
      })
  }
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || 'form'
    errors[key] ??= issue.message
  }
  return errors
}

function snapshotLine(line: QuotedLine, index: number): OrderLineSnapshot {
  if (line.status !== 'ok' || !line.productId || !line.productSlug || !line.attributes) {
    throw new AppError('VALIDATION', `A(z) ${line.sku} termék jelenleg nem rendelhető. Távolítsa el a kosárból.`)
  }
  return {
    lineId: `line-${index + 1}`,
    productId: line.productId,
    productName: line.productName,
    productSlug: line.productSlug,
    brandName: line.brandName,
    sku: line.sku,
    attributes: line.attributes,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    lineTotal: line.lineTotal,
    catalogUnitPrice: line.catalogUnitPrice,
    priceSource: line.priceSource,
  }
}

/** Sends this order's queued emails right after commit; anything that fails stays queued for the scheduler. */
async function deliverQueued(reference: string): Promise<void> {
  await notificationService.deliver(await getDueEmailJobIds(clock.nowIso(), 10, reference))
}

async function requireOrder(input: { reference?: string; orderId?: string }, auth: AuthorizationContext): Promise<Order> {
  const order = input.orderId ? await getOrderById(input.orderId, auth) : input.reference ? await getOrder(input.reference, auth) : null
  if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  return order
}

export const orderService: OrderService = {
  /**
   * Validates everything server-side, prices lines from the catalog or a still-valid signed quote,
   * stores an immutable snapshot idempotently together with its audit entry and queued emails (one
   * transaction), then attempts delivery. No payment is taken or simulated.
   */
  async placeOrder(input: unknown): Promise<PlaceOrderResult> {
    const parsed = checkoutSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, message: 'Kérjük, javítsa a megjelölt mezőket.', fieldErrors: toFieldErrors(parsed.error.issues) }
    }
    const data = parsed.data
    if (new Set(data.lines.map((line) => line.sku)).size !== data.lines.length) {
      return { ok: false, message: 'Egy termékváltozat csak egyszer szerepelhet a kosárban.', fieldErrors: {} }
    }

    try {
      const settings = await getStoreSettings()
      const method = settings.deliveryMethods.find((item: DeliveryMethod) => item.id === data.deliveryMethodId)
      const deliveryFee = resolveDeliveryFee(method)
      if (!method) throw new AppError('VALIDATION', 'Ismeretlen szállítási mód.')
      if (method.kind === 'delivery' && !data.shippingAddress) {
        return { ok: false, message: 'Házhozszállításhoz adja meg a szállítási címet.', fieldErrors: { 'shippingAddress.street': 'Adja meg a szállítási címet.' } }
      }

      const quote = await quoteService.quoteCart(data.lines)
      const lines = quote.lines.map(snapshotLine)
      const itemsTotal = sumHuf(lines.map((line: OrderLineSnapshot) => line.lineTotal))
      const totals: OrderTotals = { itemsTotal, deliveryFee, grandTotal: sumHuf([itemsTotal, deliveryFee]), currency: 'HUF' }
      const needsPriceReview = lines.some((line: OrderLineSnapshot) => line.unitPrice < line.catalogUnitPrice)
      const now = clock.nowIso()
      const { idempotencyKey, ...hashable } = data

      const customer = { type: 'customer', label: 'ügyfél (webshop)' } as const
      const auditEvents: AuditEventInput[] = [{ type: 'submitted', actor: customer, message: 'Előrendelés leadva.', newValue: { status: 'received', grandTotal: totals.grandTotal } }]
      if (needsPriceReview) {
        auditEvents.push({ type: 'price_review_flagged', actor: { type: 'system', label: 'árellenőrzés' }, message: 'Érvényes ajánlati ár alacsonyabb a jelenlegi katalógusárnál – árellenőrzés javasolt.' })
      }

      const { order, created } = await addOrder(
        {
          idempotencyKey,
          submissionHash: sha256(canonicalJson(hashable)),
          submission: {
            submittedAt: now,
            lines,
            delivery: { methodId: method.id, kind: method.kind, name: method.name, fee: deliveryFee },
            totals,
            customer: data.customer,
            billingAddress: data.billingAddress,
            shippingAddress: method.kind === 'delivery' ? data.shippingAddress : null,
            note: data.note,
            terms: { termsVersion: settings.legal.termsVersion, privacyVersion: settings.legal.privacyVersion, acceptedAt: now },
          },
          agreed: {
            lines: lines.map((line: OrderLineSnapshot) => ({ lineId: line.lineId, unitPrice: line.unitPrice, lineTotal: line.lineTotal })),
            totals,
            source: 'submission',
            proposalId: null,
            agreedAt: now,
          },
          fulfillmentStatus: 'received',
          paymentStatus: 'unpaid',
          priceApprovalStatus: 'not_required',
          needsPriceReview,
          adminNotes: [],
          auditEvents,
          cancellation: null,
          isDemo: false,
        },
        async (req: PayloadRequest, saved): Promise<void> => {
          // Queued in the order's transaction: the order is never stored without its notifications.
          const target = { ...saved, customerEmail: data.customer.email }
          await notificationService.queue({ order: target, templateId: 'order-received', recipientRole: 'customer', settings, proposalId: null, status: null }, req)
          await notificationService.queue({ order: target, templateId: 'store-new-order', recipientRole: 'store', settings, proposalId: null, status: null }, req)
        },
      )
      // The order is committed; a failed email is retried later and never undoes it.
      if (created) await deliverQueued(order.reference)
      return { ok: true, reference: order.reference, accessToken: createOrderAccessToken(order.reference), created }
    } catch (error: unknown) {
      if (error instanceof AppError && (error.code === 'VALIDATION' || error.code === 'CONFLICT')) {
        return { ok: false, message: error.message, fieldErrors: error.fieldErrors ?? {} }
      }
      throw error
    }
  },

  async getOrderForCustomer(reference: string, accessToken: string): Promise<Order | null> {
    return getOrder(reference, { kind: 'order-access', reference, accessToken })
  },

  /** Status change with audit entry; the per-status email policy is applied by the Orders hook. */
  async updateFulfillmentStatus(input: UpdateStatusInput, auth: AuthorizationContext): Promise<Order> {
    assertAdminOrSystem(auth)
    const order = await requireOrder({ reference: input.reference }, auth)
    if (order.isDemo) throw new AppError('INVALID_STATE', 'Demó (történeti) rendelés nem módosítható.')
    if (order.priceApprovalStatus === 'pending') {
      throw new AppError('INVALID_STATE', 'A teljesítés szünetel, amíg az ügyfél nem döntött az árváltozásról.')
    }
    if (!FULFILLMENT_TRANSITIONS[order.fulfillmentStatus].includes(input.status)) {
      throw new AppError('INVALID_STATE', `Nem engedélyezett állapotváltás: ${FULFILLMENT_LABELS[order.fulfillmentStatus]} → ${FULFILLMENT_LABELS[input.status]}.`)
    }
    if (input.status === 'ready_for_collection' && order.submission.delivery.kind !== 'collection') {
      throw new AppError('INVALID_STATE', 'Kiszállításos rendelés nem állítható „Átvehető” állapotba.')
    }
    if (input.status === 'dispatched' && order.submission.delivery.kind !== 'delivery') {
      throw new AppError('INVALID_STATE', 'Személyes átvételes rendelés nem állítható „Kiszállítás alatt” állapotba.')
    }
    const updated = await updateOrder(
      order.reference,
      input.expectedVersion,
      {
        fulfillmentStatus: input.status,
        appendEvents: [{ type: 'status_changed', actor: actorOf(auth), message: `Állapot: ${FULFILLMENT_LABELS[input.status]}.`, previousValue: order.fulfillmentStatus, newValue: input.status }],
      },
      auth,
    )
    await deliverQueued(updated.reference)
    return (await getOrder(updated.reference, auth)) ?? updated
  },

  /**
   * Store cancellation with a mandatory reason. A pending price proposal is withdrawn in the same
   * transaction (competing atomically with a customer decision).
   */
  async cancelOrder(input: CancelOrderInput, auth: AuthorizationContext): Promise<Order> {
    assertAdminOrSystem(auth)
    const reason = input.note.trim()
    if (reason.length < MIN_REASON_LENGTH) throw new AppError('VALIDATION', 'A törlés indoklása kötelező (legalább 3 karakter).', { reason: 'Adja meg a törlés okát.' })
    const order = await requireOrder(input, auth)
    if (order.isDemo) throw new AppError('INVALID_STATE', 'Demó (történeti) rendelés nem módosítható.')
    if (order.fulfillmentStatus === 'completed' || order.fulfillmentStatus === 'cancelled') {
      throw new AppError('INVALID_STATE', 'Teljesített vagy törölt rendelés nem törölhető.')
    }
    if (Number.isFinite(input.expectedVersion) && order.version !== input.expectedVersion) {
      throw new AppError('CONFLICT', 'A rendelést időközben módosították. Frissítse az oldalt, és próbálja újra.')
    }
    const now = clock.nowIso()
    const actor = actorOf(auth)
    const patch: OrderPatch = {
      fulfillmentStatus: 'cancelled',
      paymentStatus: 'void',
      cancellation: { reason: 'admin', note: reason.slice(0, 2000), at: now },
      appendEvents: [{ type: 'cancelled', actor, message: 'A rendelést a bolt törölte.', previousValue: order.fulfillmentStatus, newValue: 'cancelled', reason: reason.slice(0, 2000) }],
    }
    const active = await getActiveProposal(order.reference, auth)
    if (active) {
      const result = await resolveProposal(
        {
          proposalId: active.id,
          outcome: 'withdrawn',
          at: now,
          orderPatch: { ...patch, appendEvents: [{ type: 'proposal_withdrawn', actor, message: 'Az árváltozási ajánlat a rendelés törlése miatt visszavonva.', reason }, ...(patch.appendEvents ?? [])] },
        },
        auth,
      )
      if (!result.won) throw new AppError('CONFLICT', 'Az ügyfél időközben döntött az ajánlatról. Frissítse az oldalt.')
    } else {
      await updateOrder(order.reference, order.version, patch, auth)
    }
    await deliverQueued(order.reference)
    return requireOrder({ reference: order.reference }, auth)
  },

  async addAdminNote(reference: string, text: string, auth: AuthorizationContext): Promise<Order> {
    assertAdminOrSystem(auth)
    const trimmed = text.trim()
    if (!trimmed) throw new AppError('VALIDATION', 'A megjegyzés nem lehet üres.')
    return updateOrder(
      reference,
      null,
      { appendAdminNotes: [{ at: clock.nowIso(), text: trimmed.slice(0, 2000) }], appendEvents: [{ type: 'note_added', actor: actorOf(auth), message: 'Belső megjegyzés hozzáadva.' }] },
      auth,
    )
  },
}
