import 'server-only'

import { addContactMessage, updateContactMessageStatus } from '@/dto/contact-messages'
import { getStoreRecipient } from '@/config/email'
import { getEmailSettings, getStoreSettings } from '@/dto/settings'
import { clock } from '@/lib/clock'
import { checkFormToken } from '@/lib/form-token'
import { contactSubmissionSchema } from '@/schemas/contact'
import { emailService } from '@/services/emailService'
import type { AuthorizationContext } from '@/types/auth'
import type { FieldErrors } from '@/types/common'

export type ContactSubmitResult =
  /**
   * sent = accepted by Resend; simulated = EMAIL_MODE=log (nothing was sent); queued = stored, the store
   * notification failed transiently and the scheduler retries it (the visitor must not resend).
   */
  | { ok: true; delivery: 'sent' | 'simulated' | 'queued' }
  /** stored = the message itself was saved (only the notification failed); the visitor should not resend. */
  | { ok: false; message: string; fieldErrors: FieldErrors; stored: boolean }

type ContactService = {
  /** Validates, stores (idempotently) and forwards a contact-form message to the store. */
  submitContactMessage: (input: unknown) => Promise<ContactSubmitResult>
}

const CONTACT_AUTH: AuthorizationContext = { kind: 'system', process: 'contact-form' }
export const CONTACT_FORM_PURPOSE: string = 'contact'

/** Sanitized flow diagnostics: stage, outcome and the submission key (also in the email job's idempotency key); never message content or addresses. */
function trace(submissionKey: string, stage: 'validation' | 'honeypot' | 'form-token' | 'stored' | 'email', outcome: string): void {
  ;(outcome === 'ok' || outcome === 'sent' || outcome === 'simulated' ? console.info : console.warn)('[KAPCSOLAT]', { correlationId: `contact-${submissionKey.slice(0, 8)}`, stage, outcome })
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) errors[issue.path.map(String).join('.') || 'form'] ??= issue.message
  return errors
}

export const contactService: ContactService = {
  async submitContactMessage(input: unknown): Promise<ContactSubmitResult> {
    const parsed = contactSubmissionSchema.safeParse(input)
    if (!parsed.success) {
      trace(typeof (input as { submissionKey?: unknown } | null)?.submissionKey === 'string' ? String((input as { submissionKey: string }).submissionKey) : 'ismeretlen', 'validation', `invalid:${parsed.error.issues.map((issue) => issue.path.join('.')).join(',')}`)
      return { ok: false, message: 'Kérjük, javítsa a megjelölt mezőket.', fieldErrors: fieldErrors(parsed.error.issues), stored: false }
    }
    const data = parsed.data

    // Honeypot filled: nothing is stored or sent. Never reported as success or as log mode: a real visitor
    // whose browser autofilled the field must learn that the message did not arrive.
    if (data.website !== '') {
      trace(data.submissionKey, 'honeypot', 'rejected')
      return { ok: false, stored: false, fieldErrors: {}, message: 'Az üzenetet az automatikus spamszűrő visszatartotta, és nem lett rögzítve. Frissítse az oldalt, és küldje el újra; ha a hiba ismétlődik, írjon nekünk közvetlenül e-mailben.' }
    }
    const token = checkFormToken(CONTACT_FORM_PURPOSE, data.formToken)
    if (token !== 'ok') trace(data.submissionKey, 'form-token', token)
    if (token === 'too_fast') return { ok: false, message: 'Kérjük, várjon néhány másodpercet, majd küldje el újra az üzenetet.', fieldErrors: {}, stored: false }
    if (token !== 'ok') return { ok: false, message: 'Az űrlap lejárt. Frissítse az oldalt, majd küldje el újra az üzenetet.', fieldErrors: {}, stored: false }

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
      to: getStoreRecipient(await getEmailSettings()),
      replyTo: message.email,
      template: { id: 'contact-message', message },
      settings,
      orderReference: null,
      proposalId: null,
      idempotencyKey: `contact-message/${message.submissionKey}`,
      // The store should get the message now, not when the scheduler next runs.
      retryTransientOnce: true,
    })
    await updateContactMessageStatus(message.id, result.status, CONTACT_AUTH)
    trace(data.submissionKey, 'email', result.status === 'failed' ? (result.willRetry ? 'failed-retry-scheduled' : 'failed-final') : result.status === 'sent' ? 'sent' : 'simulated')
    if (result.status === 'sent') return { ok: true, delivery: 'sent' }
    if (result.status === 'sent_simulated') return { ok: true, delivery: 'simulated' }
    // Stored either way; the email history keeps the attempt and the sanitized reason for the admin.
    if (result.willRetry) return { ok: true, delivery: 'queued' }
    const direct = settings.contact.email ? ` Ha sürgős, írjon közvetlenül a(z) ${settings.contact.email} címre.` : ''
    return {
      ok: false,
      stored: true,
      fieldErrors: {},
      message: `Üzenetét rögzítettük, de a bolt e-mailes értesítése most nem sikerült, és automatikusan nem próbáljuk újra. Nem kell újra elküldenie: a bolt az üzenetet a rendszerben látja.${direct}`,
    }
  },
}
