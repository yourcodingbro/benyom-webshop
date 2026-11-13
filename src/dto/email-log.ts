import 'server-only'

import type { PayloadRequest } from 'payload'

import { lockRow } from '@/collections/hooks/db'
import { type EmailJobRef, enqueueEmailJob, type NewEmailJob } from '@/collections/hooks/emailJobs'
import { writeAuditEvents } from '@/collections/hooks/orderHooks'
import { isUniqueViolation, payloadClient, relationId, withTransaction } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import type { EmailMessage as EmailDoc } from '@/payload-types'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'
import type { EmailJob, EmailLogEntry, EmailTemplateId } from '@/types/email'
import type { OrderEventType } from '@/types/order'
import type { AuditEventInput, EmailJobStatus, EmailTemplateRef } from '@/types/workflow'

/*
 * Durable email jobs and history (collection `email-messages`). Jobs are persisted before any
 * delivery attempt; claims, completions and webhook updates run under a row lock in one transaction.
 */

export type { NewEmailJob, EmailJobRef }

export type EmailJobOutcome =
  | { kind: 'submitted'; at: IsoDateTime; messageId: string }
  | { kind: 'simulated'; at: IsoDateTime; messageId: string }
  /** `retryAt` null = permanent failure (status `failed`); otherwise the job is queued again. */
  | { kind: 'failed'; at: IsoDateTime; error: string; retryAt: IsoDateTime | null }
  | { kind: 'cancelled'; at: IsoDateTime; reason: string }

export type RenderedSnapshot = { subject: string; from: string | null; mode: 'resend' | 'log' | 'invalid'; html: string; text: string }

export type ProviderEvent = {
  eventId: string
  type: string
  providerMessageId: string | null
  occurredAt: IsoDateTime | null
  detail: string | null
}

export type ProviderEventResult = 'duplicate' | 'unknown_message' | 'applied' | 'ignored'

function toJob(doc: EmailDoc): EmailJob {
  return {
    id: doc.id,
    idempotencyKey: doc.idempotencyKey,
    category: doc.category,
    to: doc.to,
    replyTo: doc.replyTo ?? null,
    subject: doc.subject ?? '',
    template: doc.templateRef as EmailTemplateRef,
    status: doc.status as EmailJobStatus,
    attempts: doc.attempts ?? 0,
    orderId: doc.order ? Number(relationId(doc.order)) : null,
    orderReference: doc.orderReference ?? null,
    proposalId: relationId(doc.proposal),
    isDemo: Boolean(doc.isDemo),
    queuedAt: doc.queuedAt ?? doc.createdAt,
    nextAttemptAt: doc.nextAttemptAt ?? null,
    firstAttemptAt: doc.firstAttemptAt ?? null,
    submittedAt: doc.submittedAt ?? null,
    providerMessageId: doc.providerMessageId ?? null,
    lastError: doc.lastError ?? null,
    skipReason: doc.skipReason ?? null,
  }
}

async function findById(id: number, req?: PayloadRequest): Promise<EmailDoc | null> {
  const payload = req?.payload ?? (await payloadClient())
  const result = await payload.find({ collection: 'email-messages', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
  return result.docs[0] ?? null
}

/** Persists a job; inside `req`'s transaction when given, otherwise in its own. */
export async function enqueueEmail(job: NewEmailJob, req?: PayloadRequest): Promise<EmailJobRef> {
  if (req) return enqueueEmailJob(req, job)
  try {
    return await withTransaction((tx: PayloadRequest) => enqueueEmailJob(tx, job))
  } catch (error: unknown) {
    // A concurrent enqueue of the same logical email won; use its job.
    if (!isUniqueViolation(error)) throw error
    const payload = await payloadClient()
    const existing = await payload.find({ collection: 'email-messages', where: { idempotencyKey: { equals: job.idempotencyKey } }, limit: 1, depth: 0, overrideAccess: true })
    const doc = existing.docs[0]
    if (!doc) throw error
    return { id: doc.id, created: false, status: doc.status }
  }
}

export async function getEmailJob(id: number): Promise<EmailJob | null> {
  const doc = await findById(id)
  return doc ? toJob(doc) : null
}

/** Live jobs due for (re)delivery, oldest first. Demo jobs are never returned. */
export async function getDueEmailJobIds(now: IsoDateTime, limit: number, orderReference: string | null = null): Promise<number[]> {
  const payload = await payloadClient()
  const result = await payload.find({
    collection: 'email-messages',
    where: {
      and: [{ status: { equals: 'queued' } }, { nextAttemptAt: { less_than_equal: now } }, { isDemo: { not_equals: true } }, ...(orderReference ? [{ orderReference: { equals: orderReference } }] : [])],
    },
    sort: 'nextAttemptAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs.map((doc: EmailDoc) => doc.id)
}

/**
 * Claims a queued, due job for one delivery attempt (row lock + state check), so concurrent
 * scheduler runs and request-time processing never send the same job twice. A stale claim (crashed
 * worker) can be taken over. Demo jobs are cancelled instead of claimed.
 */
export async function claimEmailJob(id: number, now: IsoDateTime, staleBefore: IsoDateTime): Promise<EmailJob | null> {
  return withTransaction(async (req: PayloadRequest): Promise<EmailJob | null> => {
    if (!(await lockRow(req, 'email-messages', id))) return null
    const doc = await findById(id, req)
    if (!doc || doc.status !== 'queued') return null
    if (doc.isDemo) {
      await req.payload.update({ collection: 'email-messages', id, data: { status: 'cancelled', skipReason: 'Demó adathoz tartozik; nem küldhető.', claimedAt: null, nextAttemptAt: null }, req, overrideAccess: true })
      return null
    }
    if (doc.nextAttemptAt && doc.nextAttemptAt > now) return null
    if (doc.claimedAt && doc.claimedAt > staleBefore) return null
    const updated = await req.payload.update({
      collection: 'email-messages',
      id,
      data: { claimedAt: now, lastAttemptAt: now, firstAttemptAt: doc.firstAttemptAt ?? now, attempts: (doc.attempts ?? 0) + 1 },
      req,
      overrideAccess: true,
    })
    return toJob(updated)
  })
}

const OUTCOME_AUDIT: Record<EmailJobOutcome['kind'], OrderEventType | null> = {
  submitted: 'notification_submitted',
  simulated: 'notification_submitted',
  failed: 'notification_failed',
  cancelled: null,
}

/**
 * Records a delivery attempt's outcome and releases the claim. `inTransaction` (proposal dispatch
 * state) commits together with it. The rendered snapshot is stored once and never overwritten.
 */
export async function completeEmailJob(
  id: number,
  outcome: EmailJobOutcome,
  snapshot: RenderedSnapshot | null,
  inTransaction?: (req: PayloadRequest, job: EmailJob) => Promise<void>,
): Promise<EmailJob> {
  return withTransaction(async (req: PayloadRequest): Promise<EmailJob> => {
    await lockRow(req, 'email-messages', id)
    const doc = await findById(id, req)
    if (!doc) throw new AppError('NOT_FOUND', 'Az e-mail nem található.')
    const status: EmailJobStatus =
      outcome.kind === 'submitted' ? 'submitted' : outcome.kind === 'simulated' ? 'simulated' : outcome.kind === 'cancelled' ? 'cancelled' : outcome.retryAt ? 'queued' : 'failed'
    const data: Partial<EmailDoc> = { status, claimedAt: null }
    if (snapshot && !doc.previewHtml) {
      data.subject = snapshot.subject
      data.from = snapshot.from
      data.previewHtml = snapshot.html
      data.previewText = snapshot.text
    }
    if (snapshot) data.mode = snapshot.mode
    if (outcome.kind === 'submitted' || outcome.kind === 'simulated') {
      data.submittedAt = doc.submittedAt ?? outcome.at
      data.providerMessageId = doc.providerMessageId ?? outcome.messageId
      data.lastError = null
      data.nextAttemptAt = null
    } else if (outcome.kind === 'failed') {
      data.lastError = outcome.error
      data.nextAttemptAt = outcome.retryAt
    } else {
      data.skipReason = outcome.reason
      data.nextAttemptAt = null
    }
    const updated = await req.payload.update({ collection: 'email-messages', id, data, req, overrideAccess: true })
    const job = toJob(updated)
    const auditType = OUTCOME_AUDIT[outcome.kind]
    if (job.orderId && job.orderReference && auditType && !job.isDemo) {
      const message =
        outcome.kind === 'submitted'
          ? 'E-mail átadva a szolgáltatónak (kézbesítés még nincs visszaigazolva).'
          : outcome.kind === 'simulated'
            ? 'E-mail naplózva, nem küldött (naplózó mód).'
            : outcome.kind === 'failed'
              ? `E-mail küldése sikertelen${outcome.retryAt ? ', újrapróbálás ütemezve' : ''}: ${outcome.error}`
              : ''
      const event: AuditEventInput = { type: auditType, actor: { type: 'system', label: 'e-mail' }, message, emailMessageId: job.id, proposalId: job.proposalId }
      await writeAuditEvents(req, { id: job.orderId, reference: job.orderReference }, [event])
    }
    if (inTransaction) await inTransaction(req, job)
    return job
  })
}

/** Admin retry: a permanently failed (or stuck queued) job is queued again with the same key. */
export async function requeueEmailJob(id: number, now: IsoDateTime, auth: AuthorizationContext): Promise<EmailJob> {
  assertAdminOrSystem(auth)
  return withTransaction(async (req: PayloadRequest): Promise<EmailJob> => {
    await lockRow(req, 'email-messages', id)
    const doc = await findById(id, req)
    if (!doc) throw new AppError('NOT_FOUND', 'Az e-mail nem található.')
    if (doc.isDemo) throw new AppError('INVALID_STATE', 'Demó adathoz tartozó e-mail nem küldhető.')
    if (doc.status !== 'failed' && doc.status !== 'queued') {
      throw new AppError('INVALID_STATE', 'Csak sikertelen vagy várakozó e-mail küldhető újra. Elküldött e-mailt nem küldünk kétszer.')
    }
    const updated = await req.payload.update({ collection: 'email-messages', id, data: { status: 'queued', nextAttemptAt: now, claimedAt: null }, req, overrideAccess: true })
    return toJob(updated)
  })
}

/** Higher rank wins; equal or lower rank (late or duplicate events) never moves an email backwards. */
const STATUS_RANK: Record<string, number> = { queued: 0, simulated: 1, submitted: 1, delivered: 2, failed: 3, bounced: 3, suppressed: 3, cancelled: 3, skipped: 3 }
const EVENT_STATUS: Record<string, { status: EmailJobStatus; audit: OrderEventType } | undefined> = {
  'email.delivered': { status: 'delivered', audit: 'notification_delivered' },
  'email.bounced': { status: 'bounced', audit: 'notification_bounced' },
  'email.failed': { status: 'failed', audit: 'notification_failed' },
  'email.suppressed': { status: 'suppressed', audit: 'notification_bounced' },
}

/**
 * Applies one verified provider event. The unique `eventId` makes redeliveries no-ops; out-of-order
 * events cannot downgrade a final state. Event and state change commit together.
 */
export async function applyProviderEvent(event: ProviderEvent, receivedAt: IsoDateTime): Promise<ProviderEventResult> {
  try {
    return await withTransaction(async (req: PayloadRequest): Promise<ProviderEventResult> => {
      const emails = event.providerMessageId
        ? await req.payload.find({ collection: 'email-messages', where: { providerMessageId: { equals: event.providerMessageId } }, limit: 1, depth: 0, overrideAccess: true, req })
        : null
      const target = emails?.docs[0] ?? null
      let applied = false
      if (target) {
        await lockRow(req, 'email-messages', target.id)
        const current = (await findById(target.id, req)) ?? target
        const mapping = EVENT_STATUS[event.type]
        const occurredAt = event.occurredAt ?? receivedAt
        const newer = !current.lastEventAt || occurredAt >= current.lastEventAt
        const data: Partial<EmailDoc> = newer ? { lastEventType: event.type, lastEventAt: occurredAt } : {}
        if (mapping && (STATUS_RANK[mapping.status] ?? 0) > (STATUS_RANK[current.status] ?? 0)) {
          applied = true
          data.status = mapping.status
          if (mapping.status === 'delivered') data.deliveredAt = occurredAt
          if (mapping.status !== 'delivered') data.lastError = `Szolgáltatói esemény: ${event.type}${event.detail ? ` (${event.detail})` : ''}`
        }
        if (Object.keys(data).length > 0) await req.payload.update({ collection: 'email-messages', id: current.id, data, req, overrideAccess: true })
        const orderId = current.order ? Number(relationId(current.order)) : null
        if (applied && mapping && orderId && current.orderReference && !current.isDemo) {
          await writeAuditEvents(req, { id: orderId, reference: current.orderReference }, [
            { type: mapping.audit, actor: { type: 'system', label: 'Resend webhook' }, message: `E-mail állapot: ${mapping.status} (${current.templateId}).`, emailMessageId: current.id, proposalId: relationId(current.proposal) },
          ])
        }
      }
      await req.payload.create({
        collection: 'email-events',
        data: { eventId: event.eventId, type: event.type, providerMessageId: event.providerMessageId, emailMessage: target?.id ?? null, occurredAt: event.occurredAt, receivedAt, applied, detail: event.detail },
        req,
        overrideAccess: true,
      })
      return target ? (applied ? 'applied' : 'ignored') : 'unknown_message'
    })
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return 'duplicate'
    throw error
  }
}

function toEntry(doc: EmailDoc): EmailLogEntry {
  return {
    id: String(doc.id),
    messageId: doc.providerMessageId ?? null,
    at: doc.submittedAt ?? doc.lastAttemptAt ?? doc.queuedAt ?? doc.createdAt,
    to: doc.to,
    subject: doc.subject ?? '',
    templateId: doc.templateId as EmailTemplateId,
    orderReference: doc.orderReference ?? null,
    proposalId: relationId(doc.proposal),
    status: doc.status as EmailJobStatus,
    error: doc.lastError ?? doc.skipReason ?? null,
    preview: doc.previewHtml ? { html: doc.previewHtml, text: doc.previewText ?? '' } : null,
  }
}

export async function getEmailLogEntries(auth: AuthorizationContext): Promise<EmailLogEntry[]> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'email-messages', sort: '-queuedAt', limit: 200, depth: 0, overrideAccess: true })
  return result.docs.map(toEntry)
}

export async function getEmailLogEntry(id: string, auth: AuthorizationContext): Promise<EmailLogEntry | null> {
  assertAdminOrSystem(auth)
  const doc = await findById(Number(id))
  return doc ? toEntry(doc) : null
}
