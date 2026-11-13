import 'server-only'

import type { PayloadRequest } from 'payload'

import { getStoreRecipient } from '@/config/email'
import { type EmailJobRef, enqueueEmail } from '@/dto/email-log'
import { emailService } from '@/services/emailService'
import type { EmailTemplate, EmailTemplateId, SendEmailResult } from '@/types/email'
import type { FulfillmentStatus, NotificationRecord, Order } from '@/types/order'
import type { StoreSettings } from '@/types/settings'

type NotifyInput = {
  order: Order
  template: EmailTemplate
  recipientRole: NotificationRecord['recipientRole']
  settings: StoreSettings
  proposalId: string | null
}

export type QueueInput = {
  order: { id: number; reference: string; isDemo: boolean; customerEmail: string }
  templateId: EmailTemplateId
  recipientRole: NotificationRecord['recipientRole']
  settings: StoreSettings
  proposalId: string | null
  status: FulfillmentStatus | null
}

type NotificationService = {
  /** Sends via emailService (persisted job, then one attempt). Never throws on delivery failure. */
  notify: (input: NotifyInput) => Promise<SendEmailResult>
  /** Persists a job inside the caller's transaction; send it after commit with `deliver`. */
  queue: (input: QueueInput, req: PayloadRequest) => Promise<EmailJobRef>
  /** One delivery attempt per job right after commit; failures stay queued for the scheduler. */
  deliver: (jobIds: number[]) => Promise<void>
}

/** One logical notification = one key, reused by every retry (e.g. price-change-reminder/BNY-…/prop-…). */
export function notificationKey(templateId: EmailTemplateId, reference: string, proposalId: string | null, status: FulfillmentStatus | null): string {
  return [templateId, reference, proposalId, status].filter((part: string | null): part is string => part !== null).join('/')
}

export const notificationService: NotificationService = {
  async notify(input: NotifyInput): Promise<SendEmailResult> {
    const to = input.recipientRole === 'store' ? getStoreRecipient(input.settings, 'orders') : input.order.submission.customer.email
    const status = input.template.id === 'fulfillment-update' ? input.template.status : null
    return emailService.sendEmail({
      to,
      replyTo: null,
      template: input.template,
      settings: input.settings,
      orderReference: input.order.reference,
      proposalId: input.proposalId,
      idempotencyKey: notificationKey(input.template.id, input.order.reference, input.proposalId, status),
    })
  },

  async queue(input: QueueInput, req: PayloadRequest): Promise<EmailJobRef> {
    return enqueueEmail(
      {
        idempotencyKey: notificationKey(input.templateId, input.order.reference, input.proposalId, input.status),
        category: input.recipientRole === 'store' ? 'store' : 'customer',
        to: input.recipientRole === 'store' ? getStoreRecipient(input.settings, 'orders') : input.order.customerEmail,
        replyTo: null,
        template: { id: input.templateId, orderReference: input.order.reference, proposalId: input.proposalId, contactMessageId: null, status: input.status },
        orderId: input.order.id,
        isDemo: input.order.isDemo,
        status: 'queued',
        skipReason: null,
      },
      req,
    )
  },

  async deliver(jobIds: number[]): Promise<void> {
    for (const id of jobIds) await emailService.deliverJob(id)
  },
}
