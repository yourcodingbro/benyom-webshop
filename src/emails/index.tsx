import 'server-only'

import { render } from '@react-email/render'
import type React from 'react'

import { ContactMessageEmail, contactSubject } from '@/emails/ContactMessageEmail'
import {
  CancellationEmail,
  cancellationSubject,
  FulfillmentUpdateEmail,
  fulfillmentUpdateSubject,
  OrderReceivedEmail,
  orderReceivedSubject,
  StoreNewOrderEmail,
  storeNewOrderSubject,
} from '@/emails/OrderEmails'
import {
  acceptedSubject,
  PriceChangeAcceptedEmail,
  PriceChangeProposalEmail,
  PriceChangeReminderEmail,
  proposalSubject,
  reminderSubject,
} from '@/emails/PriceChangeEmails'
import type { EmailTemplate, RenderedEmail } from '@/types/email'
import type { StoreSettings } from '@/types/settings'

type EmailElement = { subject: string; element: React.ReactElement }

function buildEmail(template: EmailTemplate, settings: StoreSettings): EmailElement {
  switch (template.id) {
    case 'order-received':
      return { subject: orderReceivedSubject(template.order), element: <OrderReceivedEmail order={template.order} settings={settings} /> }
    case 'store-new-order':
      return { subject: storeNewOrderSubject(template.order), element: <StoreNewOrderEmail order={template.order} settings={settings} /> }
    case 'price-change-proposal':
      return {
        subject: proposalSubject(template.order),
        element: <PriceChangeProposalEmail order={template.order} proposal={template.proposal} decisionUrl={template.decisionUrl} earliestCancellation={template.earliestCancellation} settings={settings} />,
      }
    case 'price-change-reminder':
      return {
        subject: reminderSubject(template.order, template.deadline),
        element: <PriceChangeReminderEmail order={template.order} proposal={template.proposal} decisionUrl={template.decisionUrl} deadline={template.deadline} settings={settings} />,
      }
    case 'price-change-accepted':
      return { subject: acceptedSubject(template.order), element: <PriceChangeAcceptedEmail order={template.order} proposal={template.proposal} settings={settings} /> }
    case 'cancelled-after-rejection':
      return { subject: cancellationSubject(template.order), element: <CancellationEmail order={template.order} reason="rejection" settings={settings} /> }
    case 'cancelled-after-timeout':
      return { subject: cancellationSubject(template.order), element: <CancellationEmail order={template.order} reason="timeout" settings={settings} /> }
    case 'cancelled-by-store':
      return { subject: cancellationSubject(template.order), element: <CancellationEmail order={template.order} reason="store" settings={settings} /> }
    case 'fulfillment-update':
      return { subject: fulfillmentUpdateSubject(template.order, template.status), element: <FulfillmentUpdateEmail order={template.order} status={template.status} settings={settings} /> }
    case 'contact-message':
      return { subject: contactSubject(template.message), element: <ContactMessageEmail message={template.message} settings={settings} /> }
  }
}

/** Renders any transactional template with React Email to Hungarian subject, HTML and plain text. */
export async function renderEmail(template: EmailTemplate, settings: StoreSettings): Promise<RenderedEmail> {
  const { subject, element } = buildEmail(template, settings)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}
