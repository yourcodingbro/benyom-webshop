import type { PayloadRequest } from 'payload'

import { clock } from '@/lib/clock'

import type { EmailCategory, EmailJobStatus, EmailTemplateRef } from '@/types/workflow'

export type NewEmailJob = {
  idempotencyKey: string
  category: EmailCategory
  to: string
  replyTo: string | null
  template: EmailTemplateRef
  orderId: number | null
  isDemo: boolean
  /** 'queued' to send; 'skipped' to record a notification that configuration switched off. */
  status: Extract<EmailJobStatus, 'queued' | 'skipped'>
  skipReason: string | null
}

export type EmailJobRef = { id: number; created: boolean; status: string }

/**
 * Persists a notification job in the caller's transaction (no in-memory queue, no fire-and-forget).
 * One logical notification = one idempotency key: a second enqueue returns the existing job, so
 * retries and repeated saves never create duplicates. Callers serialize per order (order row lock),
 * which keeps the find-then-create race out of a single order's workflow.
 */
export async function enqueueEmailJob(req: PayloadRequest, job: NewEmailJob): Promise<EmailJobRef> {
  const existing = await req.payload.find({
    collection: 'email-messages',
    where: { idempotencyKey: { equals: job.idempotencyKey } },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  })
  const found = existing.docs[0]
  if (found) return { id: found.id, created: false, status: found.status }
  const now = clock.nowIso()
  const created = await req.payload.create({
    collection: 'email-messages',
    data: {
      idempotencyKey: job.idempotencyKey,
      templateId: job.template.id,
      category: job.category,
      to: job.to,
      replyTo: job.replyTo,
      subject: '',
      order: job.orderId,
      orderReference: job.template.orderReference,
      proposal: job.template.proposalId,
      contactMessage: job.template.contactMessageId,
      templateRef: job.template,
      status: job.status,
      skipReason: job.skipReason,
      attempts: 0,
      queuedAt: now,
      nextAttemptAt: job.status === 'queued' ? now : null,
      isDemo: job.isDemo,
    },
    req,
    overrideAccess: true,
  })
  return { id: created.id, created: true, status: created.status }
}
