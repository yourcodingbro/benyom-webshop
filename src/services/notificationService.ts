import 'server-only'

import { updateOrder } from '@/dto/orders'
import { randomToken } from '@/lib/crypto'
import { getStoreRecipient } from '@/config/email'
import { emailService, isDelivered } from '@/services/emailService'
import type { AuthorizationContext } from '@/types/auth'
import type { EmailTemplate, SendEmailResult } from '@/types/email'
import type { NotificationRecord, Order } from '@/types/order'
import type { StoreSettings } from '@/types/settings'

type NotifyInput = {
  order: Order
  template: EmailTemplate
  recipientRole: NotificationRecord['recipientRole']
  settings: StoreSettings
  proposalId: string | null
}

type NotificationService = {
  /** Sends via emailService and appends a notification record to the order. Never throws on delivery failure. */
  notify: (input: NotifyInput) => Promise<SendEmailResult>
}

const NOTIFIER_AUTH: AuthorizationContext = { kind: 'system', process: 'notifications' }

/**
 * Order notifications. A failed send is recorded on the order and never erases or rolls back
 * the order. Production needs a persisted outbox with retries; see docs/email.md.
 */
export const notificationService: NotificationService = {
  async notify(input: NotifyInput): Promise<SendEmailResult> {
    const to = input.recipientRole === 'store' ? getStoreRecipient(input.settings, 'orders') : input.order.submission.customer.email
    // One logical notification = one key, reused by retries (e.g. price-change-reminder/BNY-…/prop-…).
    const idempotencyKey = [input.template.id, input.order.reference, input.proposalId, input.template.id === 'fulfillment-update' ? input.template.status : null]
      .filter((part: string | null): part is string => part !== null)
      .join('/')
    const result = await emailService.sendEmail({
      to,
      replyTo: null,
      template: input.template,
      settings: input.settings,
      orderReference: input.order.reference,
      proposalId: input.proposalId,
      idempotencyKey,
    })
    const record: NotificationRecord = {
      id: `ntf-${randomToken(6)}`,
      templateId: input.template.id,
      recipientRole: input.recipientRole,
      status: result.status,
      attemptedAt: isDelivered(result) ? result.sentAt : result.attemptedAt,
      sentAt: isDelivered(result) ? result.sentAt : null,
      error: isDelivered(result) ? null : result.error,
      proposalId: input.proposalId,
    }
    await updateOrder(input.order.reference, null, { appendNotifications: [record] }, NOTIFIER_AUTH)
    return result
  },
}
