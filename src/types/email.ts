import type { IsoDateTime } from '@/types/common'
import type { ContactMessage } from '@/types/contact'
import type { FulfillmentStatus, Order } from '@/types/order'
import type { PriceChangeProposal } from '@/types/proposal'
import type { StoreSettings } from '@/types/settings'
import type { EmailCategory, EmailJobStatus, EmailTemplateRef } from '@/types/workflow'

/** Provider-independent email contract. Only emailService's implementation changes for Resend. */
export type EmailTemplate =
  | { id: 'order-received'; order: Order }
  | { id: 'store-new-order'; order: Order }
  | { id: 'price-change-proposal'; order: Order; proposal: PriceChangeProposal; decisionUrl: string; earliestCancellation: IsoDateTime }
  | { id: 'price-change-reminder'; order: Order; proposal: PriceChangeProposal; decisionUrl: string; deadline: IsoDateTime }
  | { id: 'price-change-accepted'; order: Order; proposal: PriceChangeProposal }
  | { id: 'cancelled-after-rejection'; order: Order }
  | { id: 'cancelled-after-timeout'; order: Order }
  | { id: 'cancelled-by-store'; order: Order }
  | { id: 'fulfillment-update'; order: Order; status: FulfillmentStatus }
  | { id: 'contact-message'; message: ContactMessage }

export type EmailTemplateId = EmailTemplate['id']

export type SendEmailInput = {
  to: string
  /** Address replies should go to (e.g. a contact-form visitor). Never used as the sender. */
  replyTo: string | null
  template: EmailTemplate
  settings: StoreSettings
  orderReference: string | null
  proposalId: string | null
  /**
   * Stable key for one logical notification (e.g. 'price-change-reminder/prop-123'). Retries reuse it,
   * so the provider can deduplicate a request that was accepted but whose response was lost.
   */
  idempotencyKey: string
}

export type SendEmailResult =
  /** Accepted by the provider (Resend), not yet confirmed delivered; `messageId` is the provider's email id. */
  | { status: 'sent'; messageId: string; sentAt: IsoDateTime }
  /** EMAIL_MODE=log: rendered and logged, not sent. */
  | { status: 'sent_simulated'; messageId: string; sentAt: IsoDateTime }
  | { status: 'failed'; attemptedAt: IsoDateTime; error: string }

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

/** One persisted email (history entry and durable job). */
export type EmailJob = {
  id: number
  idempotencyKey: string
  category: EmailCategory
  to: string
  replyTo: string | null
  subject: string
  template: EmailTemplateRef
  status: EmailJobStatus
  attempts: number
  orderId: number | null
  orderReference: string | null
  proposalId: string | null
  isDemo: boolean
  queuedAt: IsoDateTime
  nextAttemptAt: IsoDateTime | null
  firstAttemptAt: IsoDateTime | null
  submittedAt: IsoDateTime | null
  providerMessageId: string | null
  lastError: string | null
  skipReason: string | null
}

/** Admin-facing summary of an email (history list / dev tools). */
export type EmailLogEntry = {
  id: string
  messageId: string | null
  at: IsoDateTime
  to: string
  subject: string
  templateId: EmailTemplateId
  orderReference: string | null
  proposalId: string | null
  status: EmailJobStatus
  error: string | null
  /** Rendered snapshot with token-bearing links removed. */
  preview: { html: string; text: string } | null
}
