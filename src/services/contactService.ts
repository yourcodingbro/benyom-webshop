import 'server-only'

import { addContactMessage, updateContactMessageStatus } from '@/dto/contact-messages'
import { getStoreRecipient } from '@/config/email'
import { getStoreSettings } from '@/dto/settings'
import { clock } from '@/lib/clock'
import { checkFormToken } from '@/lib/form-token'
import { contactSubmissionSchema } from '@/schemas/contact'
import { emailService } from '@/services/emailService'
import type { AuthorizationContext } from '@/types/auth'
import type { FieldErrors } from '@/types/common'

export type ContactSubmitResult =
  /** sent = accepted by Resend; simulated = EMAIL_MODE=log (nothing was sent). */
  | { ok: true; delivery: 'sent' | 'simulated' }
  | { ok: false; message: string; fieldErrors: FieldErrors }

type ContactService = {
  /** Validates, stores (idempotently) and forwards a contact-form message to the store. */
  submitContactMessage: (input: unknown) => Promise<ContactSubmitResult>
}

const CONTACT_AUTH: AuthorizationContext = { kind: 'system', process: 'contact-form' }
export const CONTACT_FORM_PURPOSE: string = 'contact'

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) errors[issue.path.map(String).join('.') || 'form'] ??= issue.message
  return errors
}

export const contactService: ContactService = {
  async submitContactMessage(input: unknown): Promise<ContactSubmitResult> {
    const parsed = contactSubmissionSchema.safeParse(input)
    if (!parsed.success) return { ok: false, message: 'Kérjük, javítsa a megjelölt mezőket.', fieldErrors: fieldErrors(parsed.error.issues) }
    const data = parsed.data

    // Honeypot filled: answer like a success so bots learn nothing, but store and send nothing.
    if (data.website !== '') return { ok: true, delivery: 'simulated' }
    const token = checkFormToken(CONTACT_FORM_PURPOSE, data.formToken)
    if (token === 'too_fast') return { ok: false, message: 'Kérjük, várjon néhány másodpercet, majd küldje el újra az üzenetet.', fieldErrors: {} }
    if (token !== 'ok') return { ok: false, message: 'Az űrlap lejárt. Frissítse az oldalt, majd küldje el újra az üzenetet.', fieldErrors: {} }

    const settings = await getStoreSettings()
    const { message } = await addContactMessage({
      submissionKey: data.submissionKey,
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
      privacyVersion: settings.legal.privacyVersion,
      receivedAt: clock.nowIso(),
    })
    // A retried submission (same key) is not stored twice and is only re-sent if the earlier send failed.
    if (message.notificationStatus === 'sent') return { ok: true, delivery: 'sent' }
    if (message.notificationStatus === 'sent_simulated') return { ok: true, delivery: 'simulated' }

    const result = await emailService.sendEmail({
      to: getStoreRecipient(settings, 'contact'),
      replyTo: message.email,
      template: { id: 'contact-message', message },
      settings,
      orderReference: null,
      proposalId: null,
      idempotencyKey: `contact-message/${message.submissionKey}`,
    })
    await updateContactMessageStatus(message.id, result.status, CONTACT_AUTH)
    if (result.status === 'failed') {
      return { ok: false, message: 'Üzenetét rögzítettük, de a továbbítása nem sikerült. Kérjük, próbálja újra – nem fog kétszer megérkezni.', fieldErrors: {} }
    }
    return { ok: true, delivery: result.status === 'sent' ? 'sent' : 'simulated' }
  },
}
