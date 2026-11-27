import { randomUUID } from 'node:crypto'

import { toPlainText } from '@react-email/render'
import type { EmailAdapter, SendEmailOptions } from 'payload'

/** What the adapter hands back to Payload for one sent message. */
type NativeSendResult = { status: 'sent' | 'sent_simulated' | 'failed'; recipients: number }

/** Token-like strings (Payload's reset tokens are 40 hex characters); same pattern the email logs redact. */
const TOKEN_PATTERN: RegExp = /[A-Za-z0-9_-]{32,}/g

function addresses(value: SendEmailOptions['to']): string[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list.flatMap((item) => (typeof item === 'string' ? item.split(',') : [item.address])).map((address: string) => address.trim()).filter(Boolean)
}

function single(value: SendEmailOptions['replyTo']): string | null {
  return addresses(value as SendEmailOptions['to'])[0] ?? null
}

function asText(value: SendEmailOptions['html'] | SendEmailOptions['text']): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  return ''
}

/**
 * Payload's native email adapter (e.g. the "Elfelejtette a jelszavát?" email). It does not send anything itself:
 * every message goes through the app's emailService, so EMAIL_MODE, the store-settings sender, Resend delivery,
 * email history and sanitized logs are the same as for the app's own emails. The message is sent as Payload built it
 * (recipients, subject, HTML/text, reply-to); its token-like strings are one-shot secrets, redacted from the stored
 * preview and logs, and the message is never rebuilt or retried from storage.
 *
 * Nothing is read at creation time: emailService (and with it the store settings and Payload's own client) is
 * loaded on the first send, so creating the adapter never re-enters Payload's initialization. emailService
 * never calls payload.sendEmail, so the two cannot call each other in a loop.
 */
export const payloadEmailAdapter: EmailAdapter<NativeSendResult> = () => ({
  name: 'benyom-email-service',
  // Required by Payload's API but not used for delivery: the sender always comes from Email beállítások → Feladó.
  defaultFromName: 'Webshop',
  defaultFromAddress: 'felado@aruhaz-beallitasok.invalid',
  async sendEmail(message: SendEmailOptions): Promise<NativeSendResult> {
    if (message.attachments?.length || message.cc || message.bcc) {
      // Not used by Payload's own auth emails; refused rather than silently dropped.
      throw new Error('A Payload e-mail adapter nem támogat mellékletet, másolatot (cc) vagy titkos másolatot (bcc).')
    }
    const recipients = addresses(message.to)
    if (recipients.length === 0) throw new Error('A Payload e-mailnek nincs címzettje.')
    const html = asText(message.html)
    const text = asText(message.text) || (html ? toPlainText(html) : '')
    const subject = message.subject ?? ''
    const secrets = [...new Set(`${subject}\n${html}\n${text}`.match(TOKEN_PATTERN) ?? [])]

    const [{ emailService }, { getStoreSettings }] = await Promise.all([import('@/services/emailService'), import('@/dto/settings')])
    const settings = await getStoreSettings()
    let worst: NativeSendResult['status'] = 'sent'
    for (const to of recipients) {
      const result = await emailService.sendEmail({
        to,
        replyTo: single(message.replyTo),
        template: { id: 'payload-native', subject, html, text },
        settings,
        orderReference: null,
        proposalId: null,
        idempotencyKey: `payload-native/${randomUUID()}`,
        secrets,
      })
      if (result.status === 'failed') worst = 'failed'
      else if (result.status === 'sent_simulated' && worst === 'sent') worst = 'sent_simulated'
    }
    // A delivery failure is recorded (E-mail előzmények, sanitized [EMAIL] log) but not thrown: for the forgot-password
    // flow a thrown error would answer differently for existing accounts and reveal which addresses have one.
    return { status: worst, recipients: recipients.length }
  },
})
