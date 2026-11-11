import type { IsoDateTime } from '@/types/common'
import type { FulfillmentStatus, Order } from '@/types/order'
import type { PriceChangeProposal } from '@/types/proposal'
import type { StoreSettings } from '@/types/settings'

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

export type EmailTemplateId = EmailTemplate['id']

export type SendEmailInput = {
  to: string
  template: EmailTemplate
  settings: StoreSettings
  orderReference: string | null
  proposalId: string | null
}

export type SendEmailResult =
  | { status: 'sent_simulated'; messageId: string; sentAt: IsoDateTime }
  | { status: 'failed'; attemptedAt: IsoDateTime; error: string }

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

export type EmailLogEntry = {
  id: string
  messageId: string | null
  at: IsoDateTime
  to: string
  subject: string
  templateId: EmailTemplateId
  orderReference: string | null
  proposalId: string | null
  status: SendEmailResult['status']
  error: string | null
  /** Development-only preview; null when previews are disabled. */
  preview: { html: string; text: string } | null
}
