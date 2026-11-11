import { renderCancellation, renderFulfillmentUpdate, renderOrderReceived, renderStoreNewOrder } from '@/emails/order-emails'
import { renderAccepted, renderProposal, renderReminder } from '@/emails/price-change-emails'
import type { EmailTemplate, RenderedEmail } from '@/types/email'
import type { StoreSettings } from '@/types/settings'

/** Renders any transactional template to Hungarian subject + HTML + plain text. */
export function renderEmail(template: EmailTemplate, settings: StoreSettings): RenderedEmail {
  switch (template.id) {
    case 'order-received':
      return renderOrderReceived(template.order, settings)
    case 'store-new-order':
      return renderStoreNewOrder(template.order, settings)
    case 'price-change-proposal':
      return renderProposal(template.order, template.proposal, template.decisionUrl, template.earliestCancellation, settings)
    case 'price-change-reminder':
      return renderReminder(template.order, template.proposal, template.decisionUrl, template.deadline, settings)
    case 'price-change-accepted':
      return renderAccepted(template.order, template.proposal, settings)
    case 'cancelled-after-rejection':
      return renderCancellation(template.order, settings, 'rejection')
    case 'cancelled-after-timeout':
      return renderCancellation(template.order, settings, 'timeout')
    case 'cancelled-by-store':
      return renderCancellation(template.order, settings, 'store')
    case 'fulfillment-update':
      return renderFulfillmentUpdate(template.order, template.status, settings)
  }
}
