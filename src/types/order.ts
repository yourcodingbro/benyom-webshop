import type { VariantAttributes } from '@/types/catalog'
import type { Currency, HufAmount, IsoDateTime } from '@/types/common'
import type { DeliveryMethodKind } from '@/types/settings'
import type { AuditEventInput, EmailJobStatus } from '@/types/workflow'

export type FulfillmentStatus =
  | 'received'
  | 'under_review'
  | 'confirmed'
  | 'procurement_in_progress'
  | 'ready_for_collection'
  | 'dispatched'
  | 'completed'
  | 'cancelled'

/** Payment happens in person on collection or delivery; nothing is ever paid online. */
export type PaymentStatus = 'unpaid' | 'paid' | 'void'

export type PriceApprovalStatus = 'not_required' | 'pending' | 'accepted' | 'rejected' | 'expired'

export type CancellationReason = 'price_change_rejected' | 'price_change_timeout' | 'admin'

export type Address = {
  postalCode: string
  city: string
  street: string
  country: 'HU'
}

export type CustomerDetails = {
  name: string
  email: string
  phone: string
  companyName: string | null
  taxNumber: string | null
}

export type OrderLineSnapshot = {
  lineId: string
  productId: string
  productName: string
  productSlug: string
  brandName: string
  sku: string
  attributes: VariantAttributes
  unitPrice: HufAmount
  quantity: number
  lineTotal: HufAmount
  /** Catalog price at the moment of submission (may differ from a still-valid quote). */
  catalogUnitPrice: HufAmount
  priceSource: 'quote' | 'catalog'
}

export type OrderTotals = {
  itemsTotal: HufAmount
  deliveryFee: HufAmount
  grandTotal: HufAmount
  currency: Currency
}

/** Immutable snapshot of exactly what the customer submitted. Never rewritten. */
export type OrderSubmission = {
  submittedAt: IsoDateTime
  lines: OrderLineSnapshot[]
  delivery: { methodId: string; kind: DeliveryMethodKind; name: string; fee: HufAmount }
  totals: OrderTotals
  customer: CustomerDetails
  billingAddress: Address
  shippingAddress: Address | null
  note: string | null
  terms: { termsVersion: string; privacyVersion: string; acceptedAt: IsoDateTime }
}

/** Prices the customer has agreed to. Starts equal to the submission; changes only via an accepted proposal. */
export type AgreedPricing = {
  lines: { lineId: string; unitPrice: HufAmount; lineTotal: HufAmount }[]
  totals: OrderTotals
  source: 'submission' | 'price_change'
  proposalId: string | null
  agreedAt: IsoDateTime
}

export type OrderEventType =
  | 'submitted'
  | 'imported'
  | 'status_changed'
  | 'payment_changed'
  | 'admin_edit'
  | 'price_review_flagged'
  | 'proposal_created'
  | 'proposal_superseded'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'proposal_expired'
  | 'proposal_withdrawn'
  | 'cancelled'
  | 'note_added'
  | 'notification_queued'
  | 'notification_skipped'
  | 'notification_submitted'
  | 'notification_failed'
  | 'notification_delivered'
  | 'notification_bounced'

/** One entry of the append-only order audit trail (collection `order-events`). */
export type OrderEvent = {
  id: string
  at: IsoDateTime
  type: OrderEventType
  actor: 'customer' | 'admin' | 'system'
  /** Admin email or process name; never a client-supplied identity. */
  actorLabel: string
  message: string
  previousValue: unknown
  newValue: unknown
  reason: string | null
  proposalId: string | null
  emailMessageId: string | null
}

/** Email history entry related to the order (collection `email-messages`). */
export type NotificationRecord = {
  id: string
  templateId: string
  recipientRole: 'customer' | 'store'
  status: EmailJobStatus
  attemptedAt: IsoDateTime | null
  sentAt: IsoDateTime | null
  error: string | null
  proposalId: string | null
}

export type Order = {
  id: string
  /** Random, non-sequential public reference. Not an access credential. */
  reference: string
  idempotencyKey: string
  submissionHash: string
  submission: OrderSubmission
  agreed: AgreedPricing
  fulfillmentStatus: FulfillmentStatus
  paymentStatus: PaymentStatus
  priceApprovalStatus: PriceApprovalStatus
  /** A still-valid quote was below the catalog price at submission. */
  needsPriceReview: boolean
  adminNotes: { at: IsoDateTime; text: string }[]
  events: OrderEvent[]
  notifications: NotificationRecord[]
  cancellation: { reason: CancellationReason; note: string | null; at: IsoDateTime } | null
  /** Optimistic-concurrency version; incremented on every update. */
  version: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  /** Historical demo data from the initial import: excluded from emails, jobs and scheduling. */
  isDemo: boolean
}

export type OrderQuery = {
  search?: string
  status?: FulfillmentStatus
  from?: IsoDateTime
  to?: IsoDateTime
  page?: number
  pageSize?: number
}

export type OrderPatch = {
  fulfillmentStatus?: FulfillmentStatus
  paymentStatus?: PaymentStatus
  priceApprovalStatus?: PriceApprovalStatus
  needsPriceReview?: boolean
  agreed?: AgreedPricing
  cancellation?: Order['cancellation']
  /** Audit entries written in the same transaction as the change. */
  appendEvents?: AuditEventInput[]
  appendAdminNotes?: { at: IsoDateTime; text: string }[]
  /** Proposal-driven cancellations send their own required emails instead of the per-status one. */
  skipStatusNotification?: boolean
}
