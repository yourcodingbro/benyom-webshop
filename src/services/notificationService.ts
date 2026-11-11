import 'server-only'

import { updateOrder } from '@/dto/orders'
import { randomToken } from '@/lib/crypto'
import { emailService } from '@/services/emailService'
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
    const to = input.recipientRole === 'store' ? input.settings.storeNotificationEmail : input.order.submission.customer.email
    const result = await emailService.sendEmail({
      to,
      template: input.template,
      settings: input.settings,
      orderReference: input.order.reference,
      proposalId: input.proposalId,
    })
    const record: NotificationRecord = {
      id: `ntf-${randomToken(6)}`,
      templateId: input.template.id,
      recipientRole: input.recipientRole,
      status: result.status,
      attemptedAt: result.status === 'failed' ? result.attemptedAt : result.sentAt,
      sentAt: result.status === 'sent_simulated' ? result.sentAt : null,
      error: result.status === 'failed' ? result.error : null,
      proposalId: input.proposalId,
    }
    await updateOrder(input.order.reference, null, { appendNotifications: [record] }, NOTIFIER_AUTH)
    return result
  },
}
