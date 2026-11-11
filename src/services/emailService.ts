import 'server-only'

import { Resend } from 'resend'

import { type EmailConfig, getEmailConfig } from '@/config/email'
import { areDevToolsEnabled } from '@/config/runtime'
import { addEmailLogEntry } from '@/dto/email-log'
import { renderEmail } from '@/emails'
import { clock } from '@/lib/clock'
import { randomToken } from '@/lib/crypto'
import { consumeSimulatedEmailFailure } from '@/lib/dev-simulation'
import type { RenderedEmail, SendEmailInput, SendEmailResult } from '@/types/email'

type EmailService = {
  /**
   * Renders the React Email template and delivers it according to EMAIL_MODE.
   * Never throws for delivery problems: failures are returned as `{ status: 'failed' }`
   * so callers can record and retry them (orders are never lost because of email).
   */
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>
}

type Delivered = Extract<SendEmailResult, { sentAt: string }>

/** True when the email counts as sent: accepted by Resend, or simulated in log mode. */
export function isDelivered(result: SendEmailResult): result is Delivered {
  return result.status !== 'failed'
}

/** Removes anything that looks like a URL or token from text destined for logs. */
export function redactForLog(value: string): string {
  return value.replace(/https?:\/\/\S+/g, '[link eltávolítva]').replace(/[A-Za-z0-9_-]{32,}/g, '[token eltávolítva]')
}

const CLIENT_KEY: unique symbol = Symbol.for('benyom.resendClient')
type ClientGlobal = typeof globalThis & { [CLIENT_KEY]?: { apiKey: string; client: Resend } }

/** One server-side client per API key (rebuilt if the key changes). */
function resendClient(apiKey: string): Resend {
  const holder = globalThis as ClientGlobal
  if (holder[CLIENT_KEY]?.apiKey !== apiKey) holder[CLIENT_KEY] = { apiKey, client: new Resend(apiKey) }
  return holder[CLIENT_KEY].client
}

async function deliverViaResend(config: Extract<EmailConfig, { mode: 'resend' }>, input: SendEmailInput, rendered: RenderedEmail): Promise<SendEmailResult> {
  try {
    const response = await resendClient(config.apiKey).emails.send(
      {
        from: config.from,
        to: input.to,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      },
      { idempotencyKey: input.idempotencyKey },
    )
    if (response.error) {
      return { status: 'failed', attemptedAt: clock.nowIso(), error: `Resend hiba (${response.error.name}, ${response.error.statusCode ?? 'nincs státusz'}): ${redactForLog(response.error.message)}` }
    }
    // The period of a proposal/reminder starts here: the provider has accepted the email.
    return { status: 'sent', messageId: response.data.id, sentAt: clock.nowIso() }
  } catch (error: unknown) {
    return { status: 'failed', attemptedAt: clock.nowIso(), error: `Resend kérés sikertelen: ${redactForLog(error instanceof Error ? error.message : 'ismeretlen hiba')}` }
  }
}

export const emailService: EmailService = {
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const rendered = await renderEmail(input.template, input.settings)
    const config = getEmailConfig()

    let result: SendEmailResult
    if (config.mode === 'invalid') {
      // Never fall back to simulated success when the configured mode cannot work.
      result = { status: 'failed', attemptedAt: clock.nowIso(), error: `Hibás e-mail-beállítás: ${config.problems.join(' ')}` }
    } else if (config.mode === 'resend') {
      result = await deliverViaResend(config, input, rendered)
    } else {
      const now = clock.nowIso()
      result = consumeSimulatedEmailFailure()
        ? { status: 'failed', attemptedAt: now, error: 'Szimulált kézbesítési hiba (fejlesztői eszköz).' }
        : { status: 'sent_simulated', messageId: `sim-${randomToken(9)}`, sentAt: now }
    }

    // Metadata only: never bodies, links, tokens, reply-to addresses, credentials or billing data.
    const logLabel = config.mode === 'resend' ? '[EMAIL – RESEND]' : config.mode === 'log' ? '[EMAIL – SZIMULÁLT, NEM KÜLDÖTT]' : '[EMAIL – HIBÁS BEÁLLÍTÁS]'
    const log = result.status === 'failed' ? console.error : console.info
    log(logLabel, {
      status: result.status,
      to: input.to,
      subject: redactForLog(rendered.subject),
      template: input.template.id,
      orderReference: input.orderReference,
      proposalId: input.proposalId,
      messageId: result.status === 'failed' ? null : result.messageId,
      ...(result.status === 'failed' ? { error: result.error } : {}),
    })

    await addEmailLogEntry({
      id: randomToken(9),
      messageId: result.status === 'failed' ? null : result.messageId,
      at: result.status === 'failed' ? result.attemptedAt : result.sentAt,
      to: input.to,
      subject: rendered.subject,
      templateId: input.template.id,
      orderReference: input.orderReference,
      proposalId: input.proposalId,
      status: result.status,
      error: result.status === 'failed' ? result.error : null,
      // Previews (which may contain working decision links) exist only while dev tools are on.
      preview: areDevToolsEnabled() ? { html: rendered.html, text: rendered.text } : null,
    })

    return result
  },
}
