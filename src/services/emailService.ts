import 'server-only'

import { Resend } from 'resend'

import { type EmailConfig, getEmailConfig } from '@/config/email'
import { getServerEnv } from '@/config/env'
import { EMAIL_CLAIM_STALE_MINUTES, PROPOSAL_FINAL_WINDOW_HOURS, PROPOSAL_REMINDER_AFTER_HOURS } from '@/config/shop'
import { getContactMessage, updateContactMessageStatus } from '@/dto/contact-messages'
import {
  applyProviderEvent,
  claimEmailJob,
  completeEmailJob,
  enqueueEmail,
  type EmailJobOutcome,
  getDueEmailJobIds,
  getEmailJob,
  type ProviderEventResult,
  requeueEmailJob,
} from '@/dto/email-log'
import { getOrder } from '@/dto/orders'
import { anchorProposalEmail, getProposal, recordProposalEmailAttempt } from '@/dto/price-change-proposals'
import { getStoreSettings } from '@/dto/settings'
import { renderEmail } from '@/emails'
import { assertAdminOrSystem } from '@/lib/authorization'
import { addHours, clock } from '@/lib/clock'
import { sha256 } from '@/lib/crypto'
import { decisionToken, decisionUrl, redactDecisionLinks } from '@/lib/decision-token'
import { AppError } from '@/lib/errors'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'
import type { EmailJob, EmailTemplate, RenderedEmail, SendEmailInput, SendEmailResult } from '@/types/email'
import type { EmailKind } from '@/types/proposal'
import type { EmailCategory, EmailJobStatus, EmailTemplateRef } from '@/types/workflow'

export type ProcessReport = { processed: number; submitted: number; simulated: number; failed: number; cancelled: number }

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null }

type EmailService = {
  /**
   * Persists the email as a durable job (stable idempotency key), then attempts delivery once.
   * Never throws for delivery problems: failures are returned and retried by the scheduler, so an
   * order or message is never lost because of email. A job that was already submitted is not resent.
   */
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>
  /** One delivery attempt for a persisted job (claimed, so concurrent workers never double-send). */
  deliverJob: (id: number) => Promise<EmailJobStatus | 'busy'>
  /** Due jobs (queued, retry time reached), oldest first; for the scheduler. */
  processDue: (limit: number) => Promise<ProcessReport>
  /** Admin retry of a failed job with the same idempotency key (no new proposal, no deadline reset). */
  retry: (id: number, auth: AuthorizationContext) => Promise<EmailJobStatus | 'busy'>
  /** Verifies a Resend webhook (Svix signature over the raw body) and applies it. */
  handleWebhook: (rawBody: string, headers: WebhookHeaders) => Promise<ProviderEventResult>
}

const EMAIL_AUTH: AuthorizationContext = { kind: 'system', process: 'email-delivery' }
/** Minutes to wait before attempt n+1 (index = attempts made). After the last one the job fails permanently. */
const BACKOFF_MINUTES: readonly number[] = [1, 5, 15, 60, 180, 360, 720, 1440]
/** Provider status codes that a retry cannot fix. */
const PERMANENT_STATUS_CODES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422])

type Delivered = Extract<SendEmailResult, { sentAt: string }>

/** True when the provider accepted the email or it was logged (EMAIL_MODE=log). Neither means delivered. */
export function isDelivered(result: SendEmailResult): result is Delivered {
  return result.status !== 'failed'
}

/** Removes anything that looks like a URL or token from text destined for logs. */
export function redactForLog(value: string): string {
  return value.replace(/https?:\/\/\S+/g, '[link eltávolítva]').replace(/[A-Za-z0-9_-]{32,}/g, '[token eltávolítva]')
}

const CLIENT_KEY: unique symbol = Symbol.for('benyom.resendClient')
type ClientGlobal = typeof globalThis & { [CLIENT_KEY]?: { apiKey: string; client: Resend } }

/** One server-side client per API key (rebuilt if the key changes). The key is never logged. */
function resendClient(apiKey: string): Resend {
  const holder = globalThis as ClientGlobal
  if (holder[CLIENT_KEY]?.apiKey !== apiKey) holder[CLIENT_KEY] = { apiKey, client: new Resend(apiKey) }
  return holder[CLIENT_KEY].client
}

function categoryOf(template: EmailTemplate): EmailCategory {
  if (template.id === 'store-new-order') return 'store'
  if (template.id === 'contact-message') return 'contact'
  return 'customer'
}

function templateRefOf(input: SendEmailInput): EmailTemplateRef {
  const template = input.template
  return {
    id: template.id,
    orderReference: input.orderReference,
    proposalId: input.proposalId,
    contactMessageId: template.id === 'contact-message' ? template.message.id : null,
    status: template.id === 'fulfillment-update' ? template.status : template.id === 'cancelled-by-store' ? 'cancelled' : null,
  }
}

function proposalKind(job: EmailJob): EmailKind | null {
  return job.template.id === 'price-change-proposal' ? 'proposal' : job.template.id === 'price-change-reminder' ? 'reminder' : null
}

function retryAt(attemptsMade: number, from: Date): IsoDateTime | null {
  const minutes = BACKOFF_MINUTES[attemptsMade - 1]
  return minutes === undefined ? null : new Date(from.getTime() + minutes * 60_000).toISOString()
}

/**
 * Rebuilds the template from current database state (references only were persisted). Proposal
 * emails re-derive their decision link and print a deadline anchored to the first attempt, so every
 * retry renders the same email. Returns a reason string when the email must not be sent anymore.
 */
async function buildTemplate(job: EmailJob): Promise<{ template: EmailTemplate } | { cancel: string }> {
  const ref = job.template
  if (ref.id === 'contact-message') {
    const message = ref.contactMessageId ? await getContactMessage(ref.contactMessageId, EMAIL_AUTH) : null
    return message ? { template: { id: 'contact-message', message } } : { cancel: 'A kapcsolati üzenet nem található.' }
  }
  const order = ref.orderReference ? await getOrder(ref.orderReference, EMAIL_AUTH) : null
  if (!order) return { cancel: 'A rendelés nem található.' }
  if (order.isDemo) return { cancel: 'Demó rendeléshez nem küldünk e-mailt.' }
  switch (ref.id) {
    case 'order-received':
    case 'store-new-order':
    case 'cancelled-after-rejection':
    case 'cancelled-after-timeout':
    case 'cancelled-by-store':
      return { template: { id: ref.id, order } }
    case 'fulfillment-update':
      return ref.status ? { template: { id: 'fulfillment-update', order, status: ref.status } } : { cancel: 'Hiányzó állapot.' }
    case 'price-change-accepted':
    case 'price-change-proposal':
    case 'price-change-reminder': {
      const proposal = ref.proposalId ? await getProposal(ref.proposalId, EMAIL_AUTH) : null
      if (!proposal) return { cancel: 'Az árváltozási ajánlat nem található.' }
      if (ref.id === 'price-change-accepted') return { template: { id: 'price-change-accepted', order, proposal } }
      // A superseded or decided proposal must never be offered again.
      if (proposal.status !== 'pending') return { cancel: 'Az ajánlat már lezárult; az e-mail nem küldhető.' }
      const kind: EmailKind = ref.id === 'price-change-proposal' ? 'proposal' : 'reminder'
      const anchor = await anchorProposalEmail(proposal.id, kind, job.firstAttemptAt ?? clock.nowIso(), EMAIL_AUTH)
      const url = decisionUrl(decisionToken(proposal.id, kind))
      return kind === 'proposal'
        ? { template: { id: 'price-change-proposal', order, proposal, decisionUrl: url, earliestCancellation: addHours(anchor, PROPOSAL_REMINDER_AFTER_HOURS + PROPOSAL_FINAL_WINDOW_HOURS) } }
        : { template: { id: 'price-change-reminder', order, proposal, decisionUrl: url, deadline: addHours(anchor, PROPOSAL_FINAL_WINDOW_HOURS) } }
    }
    default:
      return { cancel: 'Ismeretlen sablon.' }
  }
}

async function send(config: EmailConfig, job: EmailJob, rendered: RenderedEmail): Promise<EmailJobOutcome> {
  const now = clock.now()
  const at = now.toISOString()
  if (config.mode === 'log') return { kind: 'simulated', at, messageId: `naplo-${job.id}` }
  if (config.mode === 'invalid') {
    // Never fall back to simulated success when the configured mode cannot work.
    return { kind: 'failed', at, error: `Hibás e-mail-beállítás: ${config.problems.join(' ')}`, retryAt: retryAt(job.attempts, now) }
  }
  try {
    const response = await resendClient(config.apiKey).emails.send(
      { from: config.from, to: job.to, ...(job.replyTo ? { replyTo: job.replyTo } : {}), subject: rendered.subject, html: rendered.html, text: rendered.text },
      { idempotencyKey: job.idempotencyKey },
    )
    if (response.error) {
      const permanent = response.error.statusCode !== null && PERMANENT_STATUS_CODES.has(response.error.statusCode)
      return {
        kind: 'failed',
        at,
        error: `Resend hiba (${response.error.name}, ${response.error.statusCode ?? 'nincs státusz'}): ${redactForLog(response.error.message)}`,
        retryAt: permanent ? null : retryAt(job.attempts, now),
      }
    }
    // Accepted by the provider. Delivery is confirmed only by a later webhook event.
    return { kind: 'submitted', at, messageId: response.data.id }
  } catch (error: unknown) {
    return { kind: 'failed', at, error: `Resend kérés sikertelen: ${redactForLog(error instanceof Error ? error.message : 'ismeretlen hiba')}`, retryAt: retryAt(job.attempts, now) }
  }
}

function toResult(job: EmailJob): SendEmailResult {
  if (job.status === 'submitted' || job.status === 'delivered') return { status: 'sent', messageId: job.providerMessageId ?? '', sentAt: job.submittedAt ?? clock.nowIso() }
  if (job.status === 'simulated') return { status: 'sent_simulated', messageId: job.providerMessageId ?? '', sentAt: job.submittedAt ?? clock.nowIso() }
  return { status: 'failed', attemptedAt: clock.nowIso(), error: job.lastError ?? job.skipReason ?? `Az e-mail állapota: ${job.status}.` }
}

async function deliverJob(id: number): Promise<EmailJobStatus | 'busy'> {
  const now = clock.now()
  const staleBefore = new Date(now.getTime() - EMAIL_CLAIM_STALE_MINUTES * 60_000).toISOString()
  const job = await claimEmailJob(id, now.toISOString(), staleBefore)
  if (!job) return (await getEmailJob(id))?.status ?? 'busy'

  try {
    const built = await buildTemplate(job)
    if ('cancel' in built) return (await completeEmailJob(id, { kind: 'cancelled', at: clock.nowIso(), reason: built.cancel }, null)).status
    const config = getEmailConfig()
    const rendered = await renderEmail(built.template, await getStoreSettings())
    const outcome = await send(config, job, rendered)
    const kind = proposalKind(job)
    const snapshot = {
      subject: rendered.subject,
      from: config.mode === 'resend' ? config.from : null,
      mode: config.mode,
      // History snapshot: token-bearing decision links are removed before storing.
      html: redactDecisionLinks(rendered.html),
      text: redactDecisionLinks(rendered.text),
    }
    const completed = await completeEmailJob(id, outcome, snapshot, async (req, finished) => {
      if (!kind || !finished.proposalId) return
      const token = decisionToken(finished.proposalId, kind)
      await recordProposalEmailAttempt(
        req,
        finished.proposalId,
        kind,
        outcome.kind === 'submitted'
          ? { kind: 'accepted', at: outcome.at, tokenHash: sha256(token) }
          : outcome.kind === 'simulated'
            ? { kind: 'simulated', at: outcome.at, note: 'Naplózó mód (EMAIL_MODE=log): az e-mail nem lett elküldve, ezért válaszhatáridő sem indult.' }
            : { kind: 'failed', at: outcome.at, error: outcome.kind === 'failed' ? outcome.error : 'Megszakítva.' },
      )
    })
    if (job.template.id === 'contact-message' && job.template.contactMessageId) {
      const status = completed.status === 'submitted' ? 'sent' : completed.status === 'simulated' ? 'sent_simulated' : 'failed'
      await updateContactMessageStatus(job.template.contactMessageId, status, EMAIL_AUTH)
    }
    const log = completed.status === 'queued' || completed.status === 'failed' ? console.error : console.info
    // Metadata only: never bodies, links, tokens, reply-to addresses or credentials.
    log('[EMAIL]', { mode: config.mode, status: completed.status, template: job.template.id, to: job.to, orderReference: job.orderReference, proposalId: job.proposalId, attempts: completed.attempts, messageId: completed.providerMessageId })
    return completed.status
  } catch (error: unknown) {
    // Unexpected error (e.g. database): release the claim with a scheduled retry; never lose the job.
    const message = redactForLog(error instanceof Error ? error.message : 'ismeretlen hiba')
    const completed = await completeEmailJob(id, { kind: 'failed', at: clock.nowIso(), error: `Belső hiba: ${message}`, retryAt: retryAt(job.attempts, clock.now()) }, null)
    return completed.status
  }
}

export const emailService: EmailService = {
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const order = input.orderReference ? await getOrder(input.orderReference, EMAIL_AUTH) : null
    const ref = await enqueueEmail({
      idempotencyKey: input.idempotencyKey,
      category: categoryOf(input.template),
      to: input.to,
      replyTo: input.replyTo,
      template: templateRefOf(input),
      orderId: order ? Number(order.id) : null,
      isDemo: order?.isDemo ?? false,
      status: 'queued',
      skipReason: null,
    })
    await deliverJob(ref.id)
    const job = await getEmailJob(ref.id)
    if (!job) throw new AppError('NOT_FOUND', 'Az e-mail nem található.')
    return toResult(job)
  },

  deliverJob,

  async processDue(limit: number): Promise<ProcessReport> {
    const report: ProcessReport = { processed: 0, submitted: 0, simulated: 0, failed: 0, cancelled: 0 }
    for (const id of await getDueEmailJobIds(clock.nowIso(), limit)) {
      const status = await deliverJob(id)
      report.processed += 1
      if (status === 'submitted') report.submitted += 1
      else if (status === 'simulated') report.simulated += 1
      else if (status === 'cancelled') report.cancelled += 1
      else if (status === 'queued' || status === 'failed') report.failed += 1
    }
    return report
  },

  async retry(id: number, auth: AuthorizationContext): Promise<EmailJobStatus | 'busy'> {
    assertAdminOrSystem(auth)
    await requeueEmailJob(id, clock.nowIso(), auth)
    return deliverJob(id)
  },

  async handleWebhook(rawBody: string, headers: WebhookHeaders): Promise<ProviderEventResult> {
    const secret = getServerEnv().RESEND_WEBHOOK_SECRET
    if (!secret) throw new AppError('UNAVAILABLE', 'A Resend webhook nincs beállítva (RESEND_WEBHOOK_SECRET).')
    if (!headers.id || !headers.timestamp || !headers.signature) throw new AppError('FORBIDDEN', 'Hiányzó webhook-aláírás.')
    // Verification needs no API call; the client is only the SDK's entry point.
    const verifier = new Resend(process.env.RESEND_API_KEY || 're_webhook_verification_only')
    let event: { type: string; created_at?: string; data?: unknown }
    try {
      event = verifier.webhooks.verify({ payload: rawBody, headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature }, webhookSecret: secret }) as typeof event
    } catch {
      throw new AppError('FORBIDDEN', 'Érvénytelen webhook-aláírás.')
    }
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as { email_id?: unknown; created_at?: unknown; bounce?: { type?: unknown; message?: unknown } }
    const occurredAt = typeof event.created_at === 'string' ? new Date(event.created_at).toISOString() : typeof data.created_at === 'string' ? new Date(data.created_at).toISOString() : null
    const detail = data.bounce && typeof data.bounce.type === 'string' ? `${data.bounce.type}${typeof data.bounce.message === 'string' ? `: ${redactForLog(data.bounce.message).slice(0, 200)}` : ''}` : null
    return applyProviderEvent(
      { eventId: headers.id, type: event.type, providerMessageId: typeof data.email_id === 'string' ? data.email_id : null, occurredAt, detail },
      clock.nowIso(),
    )
  },
}
