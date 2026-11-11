import 'server-only'

import { areDevToolsEnabled } from '@/config/runtime'
import { addEmailLogEntry } from '@/dto/email-log'
import { renderEmail } from '@/emails'
import { clock } from '@/lib/clock'
import { randomToken } from '@/lib/crypto'
import { consumeSimulatedEmailFailure } from '@/lib/dev-simulation'
import type { SendEmailInput, SendEmailResult } from '@/types/email'

type EmailService = {
  /**
   * Renders and "sends" a transactional email. Never throws for delivery problems:
   * failures are returned as `{ status: 'failed' }` so callers can record and retry.
   */
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>
}

/** Removes anything that looks like a URL or token from text destined for logs. */
export function redactForLog(value: string): string {
  return value.replace(/https?:\/\/\S+/g, '[link eltávolítva]').replace(/[A-Za-z0-9_-]{32,}/g, '[token eltávolítva]')
}

/**
 * SAMPLE IMPLEMENTATION – no email ever leaves this process.
 * Later only this method body changes: call Resend's API, treat a successful API
 * submission as `sentAt`, and map provider errors to `{ status: 'failed' }`.
 */
export const emailService: EmailService = {
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const rendered = renderEmail(input.template, input.settings)
    const failed = consumeSimulatedEmailFailure()
    const now = clock.nowIso()
    const result: SendEmailResult = failed
      ? { status: 'failed', attemptedAt: now, error: 'Szimulált kézbesítési hiba (fejlesztői eszköz).' }
      : { status: 'sent_simulated', messageId: `sim-${randomToken(9)}`, sentAt: now }

    // Log metadata only: never bodies, links, tokens, or billing/shipping details.
    console.info('[EMAIL – SZIMULÁLT, NEM KÜLDÖTT]', {
      status: result.status,
      to: input.to,
      subject: redactForLog(rendered.subject),
      template: input.template.id,
      orderReference: input.orderReference,
      proposalId: input.proposalId,
    })

    await addEmailLogEntry({
      id: randomToken(9),
      messageId: result.status === 'sent_simulated' ? result.messageId : null,
      at: now,
      to: input.to,
      subject: rendered.subject,
      templateId: input.template.id,
      orderReference: input.orderReference,
      proposalId: input.proposalId,
      status: result.status,
      error: result.status === 'failed' ? result.error : null,
      // Previews (which may contain working sample decision links) exist only while dev tools are on.
      preview: areDevToolsEnabled() ? { html: rendered.html, text: rendered.text } : null,
    })

    return result
  },
}
