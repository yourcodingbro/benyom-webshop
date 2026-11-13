import type { EmailTemplateId } from '@/types/email'
import type { FulfillmentStatus, OrderEventType } from '@/types/order'

/** Who caused an audited change. Always derived server-side (Payload `req.user` or the calling service). */
export type AuditActor =
  | { type: 'admin'; userId: string | number | null; label: string }
  | { type: 'customer'; label: string }
  | { type: 'system'; label: string }

export type AuditEventInput = {
  type: OrderEventType
  actor: AuditActor
  message: string
  previousValue?: unknown
  newValue?: unknown
  reason?: string | null
  proposalId?: string | null
  emailMessageId?: number | null
  /** Defaults to now. Only the initial import sets it (historical demo events keep their time). */
  at?: string
}

/**
 * Server-side `req.context` for order writes. REST/GraphQL clients cannot set `req.context`, so none of
 * these flags can be supplied from outside; they are set only by application code (services, DTOs,
 * the import script).
 */
export type OrderWriteContext = {
  /** A service-driven workflow change (validated by the service); otherwise the write is an admin edit. */
  workflow?: boolean
  /** Audit entries written in the same transaction as the change. */
  auditEvents?: AuditEventInput[]
  /** Proposal-driven cancellations send their own required emails, not the per-status one. */
  skipStatusNotification?: boolean
  /** Initial demo import: no emails, jobs or other side effects. */
  suppressSideEffects?: boolean
}

/** Data needed to rebuild an email at send time. Holds references only: no tokens, links or rendered content. */
export type EmailTemplateRef = {
  id: EmailTemplateId
  orderReference: string | null
  proposalId: string | null
  contactMessageId: string | null
  status: FulfillmentStatus | null
}

export type EmailJobStatus = 'queued' | 'submitted' | 'delivered' | 'failed' | 'bounced' | 'suppressed' | 'cancelled' | 'skipped' | 'simulated'

export type EmailCategory = 'customer' | 'store' | 'contact'

/** Status-transition emails that can be switched off per target status (Értesítési beállítások). */
export const SWITCHABLE_STATUS_EMAILS: readonly FulfillmentStatus[] = ['under_review', 'confirmed', 'procurement_in_progress', 'ready_for_collection', 'dispatched', 'completed', 'cancelled']
