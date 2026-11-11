import 'server-only'

import { FULFILLMENT_LABELS } from '@/config/labels'
import { FULFILLMENT_TRANSITIONS } from '@/config/order-rules'
import { isSampleCheckoutEnabled } from '@/config/runtime'
import { addOrder, getOrder, updateOrder } from '@/dto/orders'
import { getActiveProposal, resolveProposal } from '@/dto/price-change-proposals'
import { getStoreSettings } from '@/dto/settings'
import { assertAdminOrSystem } from '@/lib/authorization'
import { clock } from '@/lib/clock'
import { canonicalJson, randomToken, sha256 } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { sumHuf } from '@/lib/money'
import { createOrderAccessToken } from '@/lib/order-access'
import { checkoutSchema } from '@/schemas/checkout'
import { notificationService } from '@/services/notificationService'
import { quoteService } from '@/services/quoteService'
import type { QuotedLine } from '@/types/cart'
import type { AuthorizationContext } from '@/types/auth'
import type { FieldErrors, HufAmount } from '@/types/common'
import type { EmailTemplate } from '@/types/email'
import type { FulfillmentStatus, Order, OrderEvent, OrderLineSnapshot, OrderTotals } from '@/types/order'
import type { DeliveryMethod } from '@/types/settings'

export type PlaceOrderResult =
  | { ok: true; reference: string; accessToken: string; created: boolean }
  | { ok: false; message: string; fieldErrors: FieldErrors }

export type UpdateStatusInput = {
  reference: string
  status: FulfillmentStatus
  expectedVersion: number
}

export type CancelOrderInput = {
  reference: string
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

const NOTIFY_ON_STATUS: ReadonlySet<FulfillmentStatus> = new Set(['confirmed', 'ready_for_collection', 'dispatched', 'completed'])

function event(type: OrderEvent['type'], actor: OrderEvent['actor'], message: string): OrderEvent {
  return { id: `ev-${randomToken(6)}`, at: clock.nowIso(), type, actor, message }
}

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

export const orderService: OrderService = {
  /**
   * Validates everything server-side, prices lines from the catalog or a still-valid
   * signed quote, stores an immutable snapshot idempotently, then sends notifications.
   * No payment is taken or simulated.
   */
  async placeOrder(input: unknown): Promise<PlaceOrderResult> {
    if (!isSampleCheckoutEnabled()) {
      throw new AppError('UNAVAILABLE', 'A minta-pénztár éles környezetben le van tiltva. Valódi rendelés itt nem adható le.')
    }
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

      const events: OrderEvent[] = [event('submitted', 'customer', 'Előrendelés leadva.')]
      if (needsPriceReview) {
        events.push(event('price_review_flagged', 'system', 'Érvényes ajánlati ár alacsonyabb a jelenlegi katalógusárnál – árellenőrzés javasolt.'))
      }

      const { order, created } = await addOrder({
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
        events,
        notifications: [],
        cancellation: null,
        isSample: true,
      })

      if (created) {
        // The order is already stored; a failed email is recorded and never undoes it.
        await notificationService.notify({ order, template: { id: 'order-received', order }, recipientRole: 'customer', settings, proposalId: null })
        await notificationService.notify({ order, template: { id: 'store-new-order', order }, recipientRole: 'store', settings, proposalId: null })
      }
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

  async updateFulfillmentStatus(input: UpdateStatusInput, auth: AuthorizationContext): Promise<Order> {
    assertAdminOrSystem(auth)
    const order = await getOrder(input.reference, auth)
    if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
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
      input.reference,
      input.expectedVersion,
      { fulfillmentStatus: input.status, appendEvents: [event('status_changed', 'admin', `Állapot: ${FULFILLMENT_LABELS[input.status]}.`)] },
      auth,
    )
    if (NOTIFY_ON_STATUS.has(input.status)) {
      const template: EmailTemplate = { id: 'fulfillment-update', order: updated, status: input.status }
      await notificationService.notify({ order: updated, template, recipientRole: 'customer', settings: await getStoreSettings(), proposalId: null })
    }
    return updated
  },

  async cancelOrder(input: CancelOrderInput, auth: AuthorizationContext): Promise<Order> {
    assertAdminOrSystem(auth)
    const order = await getOrder(input.reference, auth)
    if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
    if (order.fulfillmentStatus === 'completed' || order.fulfillmentStatus === 'cancelled') {
      throw new AppError('INVALID_STATE', 'Teljesített vagy törölt rendelés nem törölhető.')
    }
    const now = clock.nowIso()
    const patch = {
      fulfillmentStatus: 'cancelled' as const,
      paymentStatus: 'void' as const,
      cancellation: { reason: 'admin' as const, note: input.note.trim() || null, at: now },
      appendEvents: [event('cancelled', 'admin', 'A rendelést a bolt törölte.')],
    }
    const active = await getActiveProposal(order.reference, auth)
    let updated: Order
    if (active) {
      // Withdraw the pending proposal and cancel in one competing transition.
      const result = await resolveProposal(
        {
          proposalId: active.id,
          outcome: 'withdrawn',
          at: now,
          orderPatch: { ...patch, appendEvents: [event('proposal_withdrawn', 'admin', 'Az árváltozási ajánlat a rendelés törlése miatt visszavonva.'), ...patch.appendEvents] },
        },
        auth,
      )
      if (!result.won) throw new AppError('CONFLICT', 'Az ügyfél időközben döntött az ajánlatról. Frissítse az oldalt.')
      updated = result.order
    } else {
      updated = await updateOrder(order.reference, input.expectedVersion, patch, auth)
    }
    await notificationService.notify({ order: updated, template: { id: 'cancelled-by-store', order: updated }, recipientRole: 'customer', settings: await getStoreSettings(), proposalId: null })
    return updated
  },

  async addAdminNote(reference: string, text: string, auth: AuthorizationContext): Promise<Order> {
    assertAdminOrSystem(auth)
    const trimmed = text.trim()
    if (!trimmed) throw new AppError('VALIDATION', 'A megjegyzés nem lehet üres.')
    return updateOrder(reference, null, { appendAdminNotes: [{ at: clock.nowIso(), text: trimmed.slice(0, 2000) }], appendEvents: [event('note_added', 'admin', 'Belső megjegyzés hozzáadva.')] }, auth)
  },
}
