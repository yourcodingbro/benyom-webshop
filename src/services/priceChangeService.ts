import 'server-only'

import type { PayloadRequest } from 'payload'

import { getEmailConfig } from '@/config/email'
import { PROPOSAL_INELIGIBLE_STATUSES } from '@/config/order-rules'
import { PROPOSAL_FINAL_WINDOW_HOURS, PROPOSAL_REMINDER_AFTER_HOURS } from '@/config/shop'
import { enqueueEmail } from '@/dto/email-log'
import { getOrder, getOrderById } from '@/dto/orders'
import { addProposal, getActiveProposal, getPendingProposals, getProposal, getProposalByTokenHash, resolveProposal } from '@/dto/price-change-proposals'
import { getStoreSettings } from '@/dto/settings'
import { actorOf } from '@/lib/audit'
import { assertAdminOrSystem } from '@/lib/authorization'
import { addHours, clock } from '@/lib/clock'
import { sha256 } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { multiplyHuf, sumHuf } from '@/lib/money'
import { createProposalSchema, type CreateProposalInput, decisionSchema } from '@/schemas/proposal'
import { emailService } from '@/services/emailService'
import { notificationKey, notificationService } from '@/services/notificationService'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'
import type { Order, OrderTotals } from '@/types/order'
import type { EmailKind, PriceChangeProposal, ProposalLine, ProposalStatus } from '@/types/proposal'
import type { AuditEventInput } from '@/types/workflow'

export type ProposalDeadlines = {
  /** When the reminder becomes due (24 h after the proposal email was accepted by the provider). */
  reminderDueAt: IsoDateTime | null
  /** Final cancellation time (24 h after the reminder was accepted by the provider). */
  expiresAt: IsoDateTime | null
  /** Earliest possible cancellation if the reminder is sent exactly on time. */
  earliestCancellationAt: IsoDateTime | null
}

export type ProposalReview = {
  orderReference: string
  lines: ProposalLine[]
  originalTotals: OrderTotals
  proposedTotals: OrderTotals
  explanation: string
  activeProposalId: string | null
  /** Only Resend (live) mode can start real customer deadlines. */
  deliveryMode: 'resend' | 'log' | 'invalid'
}

export type DecisionView =
  | { state: 'invalid' }
  | {
      state: ProposalStatus
      orderReference: string
      customerName: string
      lines: ProposalLine[]
      originalTotals: OrderTotals
      proposedTotals: OrderTotals
      explanation: string
      deadlines: ProposalDeadlines
    }

export type DecisionResult =
  | { outcome: 'accepted' | 'rejected' }
  | { outcome: 'already_resolved'; status: ProposalStatus }
  | { outcome: 'invalid' }

export type SchedulerReport = {
  ranAt: IsoDateTime
  proposalEmailsSent: number
  remindersSent: number
  expired: number
  failures: number
}

type PriceChangeService = {
  reviewProposal: (input: unknown, auth: AuthorizationContext) => Promise<ProposalReview>
  createProposal: (input: unknown, auth: AuthorizationContext) => Promise<PriceChangeProposal>
  getDecisionView: (token: string) => Promise<DecisionView>
  decide: (input: unknown) => Promise<DecisionResult>
  processDueProposals: (auth: AuthorizationContext) => Promise<SchedulerReport>
  getDeadlines: (proposal: PriceChangeProposal) => ProposalDeadlines
}

const DECISION_AUTH: AuthorizationContext = { kind: 'system', process: 'customer-decision' }
const INELIGIBLE: ReadonlySet<Order['fulfillmentStatus']> = new Set(PROPOSAL_INELIGIBLE_STATUSES)

async function requireOrder(data: CreateProposalInput, auth: AuthorizationContext): Promise<Order> {
  const order = data.orderId ? await getOrderById(data.orderId, auth) : data.orderReference ? await getOrder(data.orderReference, auth) : null
  if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  return order
}

/** Shared by the review step and creation, so what the admin reviews is exactly what is saved. */
async function planProposal(input: unknown, auth: AuthorizationContext): Promise<{ data: CreateProposalInput; order: Order; review: ProposalReview }> {
  assertAdminOrSystem(auth)
  const parsed = createProposalSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Érvénytelen ajánlat.')
  const data = parsed.data
  const order = await requireOrder(data, auth)
  if (order.isDemo) throw new AppError('INVALID_STATE', 'Demó (történeti) rendeléshez nem küldhető árváltozási ajánlat.')
  if (INELIGIBLE.has(order.fulfillmentStatus)) {
    throw new AppError('INVALID_STATE', 'Kiszállított, teljesített vagy törölt rendeléshez nem küldhető árváltozási ajánlat.')
  }
  const active = await getActiveProposal(order.reference, auth)
  if (active && !data.supersedeActive) {
    throw new AppError('CONFLICT', 'A rendeléshez már tartozik aktív ajánlat. Felülírásához jelölje be a felülírást.')
  }
  const proposedByLine = new Map(data.lines.map((line) => [line.lineId, line.proposedUnitPrice]))
  const lines: ProposalLine[] = order.submission.lines.map((line) => {
    const agreed = order.agreed.lines.find((item) => item.lineId === line.lineId)
    if (!agreed) throw new AppError('INVALID_STATE', 'Hiányos rendelési adatok.')
    return {
      lineId: line.lineId,
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      originalUnitPrice: agreed.unitPrice,
      proposedUnitPrice: proposedByLine.get(line.lineId) ?? agreed.unitPrice,
    }
  })
  for (const lineId of proposedByLine.keys()) {
    if (!lines.some((line: ProposalLine) => line.lineId === lineId)) throw new AppError('VALIDATION', 'Ismeretlen rendelési tétel.')
  }
  if (lines.every((line: ProposalLine) => line.originalUnitPrice === line.proposedUnitPrice)) {
    throw new AppError('VALIDATION', 'Az ajánlat nem tartalmaz árváltozást.')
  }
  const itemsTotal = sumHuf(lines.map((line: ProposalLine) => multiplyHuf(line.proposedUnitPrice, line.quantity)))
  const deliveryFee = order.agreed.totals.deliveryFee
  return {
    data,
    order,
    review: {
      orderReference: order.reference,
      lines,
      originalTotals: order.agreed.totals,
      proposedTotals: { itemsTotal, deliveryFee, grandTotal: sumHuf([itemsTotal, deliveryFee]), currency: 'HUF' },
      explanation: data.explanation,
      activeProposalId: active?.id ?? null,
      deliveryMode: getEmailConfig().mode,
    },
  }
}

/**
 * Persists the proposal/reminder email job (stable key: one logical email per proposal and kind) and
 * attempts it once. Retries reuse the same job, so they never create another proposal or move a
 * deadline; the period starts only when the provider accepts the email (see emailService).
 */
async function dispatchProposalEmail(proposal: PriceChangeProposal, kind: EmailKind): Promise<'sent' | 'failed' | 'skipped'> {
  const order = await getOrder(proposal.orderReference, DECISION_AUTH)
  if (!order || order.isDemo) return 'skipped'
  const templateId = kind === 'proposal' ? 'price-change-proposal' : 'price-change-reminder'
  const job = await enqueueEmail({
    idempotencyKey: notificationKey(templateId, order.reference, proposal.id, null),
    category: 'customer',
    to: order.submission.customer.email,
    replyTo: null,
    template: { id: templateId, orderReference: order.reference, proposalId: proposal.id, contactMessageId: null, status: null },
    orderId: Number(order.id),
    isDemo: false,
    status: 'queued',
    skipReason: null,
  })
  const status = await emailService.deliverJob(job.id)
  return status === 'submitted' || status === 'delivered' ? 'sent' : status === 'queued' || status === 'failed' ? 'failed' : 'skipped'
}

/** Expiry transition; competes atomically with a customer decision. Returns true if it won. */
async function expireProposal(proposalId: string, auth: AuthorizationContext): Promise<boolean> {
  const now = clock.nowIso()
  const system = { type: 'system', label: 'árváltozás-ütemező' } as const
  let jobId: number | null = null
  const result = await resolveProposal(
    {
      proposalId,
      outcome: 'expired',
      at: now,
      orderPatch: {
        priceApprovalStatus: 'expired',
        fulfillmentStatus: 'cancelled',
        paymentStatus: 'void',
        cancellation: { reason: 'price_change_timeout', note: null, at: now },
        skipStatusNotification: true,
        appendEvents: [
          { type: 'proposal_expired', actor: system, message: 'Az árváltozási ajánlat határideje lejárt.' },
          { type: 'cancelled', actor: system, message: 'A teljes rendelés törölve (nem érkezett döntés).', previousValue: 'pending', newValue: 'cancelled', reason: 'Árváltozás: határidő lejárt' },
        ],
      },
      inTransaction: async (req: PayloadRequest, proposal: PriceChangeProposal, orderId: number): Promise<void> => {
        jobId = (await queueDecisionEmail(req, proposal, orderId, 'cancelled-after-timeout')).id
      },
    },
    auth,
  )
  if (result.won && jobId !== null) await notificationService.deliver([jobId])
  return result.won
}

async function queueDecisionEmail(req: PayloadRequest, proposal: PriceChangeProposal, orderId: number, templateId: 'price-change-accepted' | 'cancelled-after-rejection' | 'cancelled-after-timeout'): Promise<{ id: number }> {
  const order = await getOrder(proposal.orderReference, DECISION_AUTH)
  if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  return notificationService.queue(
    {
      order: { id: orderId, reference: order.reference, isDemo: order.isDemo, customerEmail: order.submission.customer.email },
      templateId,
      recipientRole: 'customer',
      settings: await getStoreSettings(),
      proposalId: proposal.id,
      status: null,
    },
    req,
  )
}

export const priceChangeService: PriceChangeService = {
  getDeadlines(proposal: PriceChangeProposal): ProposalDeadlines {
    const sentAt = proposal.proposalEmail.sentAt
    const reminderAt = proposal.reminderEmail.sentAt
    return {
      reminderDueAt: sentAt ? addHours(sentAt, PROPOSAL_REMINDER_AFTER_HOURS) : null,
      // A late reminder still gives the full final window: it is counted from the reminder itself.
      expiresAt: reminderAt ? addHours(reminderAt, PROPOSAL_FINAL_WINDOW_HOURS) : null,
      earliestCancellationAt: sentAt ? addHours(sentAt, PROPOSAL_REMINDER_AFTER_HOURS + PROPOSAL_FINAL_WINDOW_HOURS) : null,
    }
  },

  /** Read-only review step for the admin: computes lines and totals; nothing is saved or sent. */
  async reviewProposal(input: unknown, auth: AuthorizationContext): Promise<ProposalReview> {
    return (await planProposal(input, auth)).review
  },

  async createProposal(input: unknown, auth: AuthorizationContext): Promise<PriceChangeProposal> {
    const { data, order, review } = await planProposal(input, auth)
    const now = clock.nowIso()
    const empty = { attempts: 0, firstAttemptAt: null, lastAttemptAt: null, lastError: null, claimedAt: null, sentAt: null }
    const createdEvent: AuditEventInput = {
      type: 'proposal_created',
      actor: actorOf(auth),
      message: 'Árváltozási ajánlat létrehozva; a teljesítés az ügyfél döntéséig szünetel.',
      previousValue: { grandTotal: review.originalTotals.grandTotal },
      newValue: { grandTotal: review.proposedTotals.grandTotal },
      reason: data.explanation,
    }
    const proposal = await addProposal(
      {
        proposal: {
          orderReference: order.reference,
          lines: review.lines,
          originalTotals: review.originalTotals,
          proposedTotals: review.proposedTotals,
          explanation: data.explanation,
          createdAt: now,
          createdBy: auth.kind === 'admin' ? (auth.label ?? auth.adminId) : auth.kind,
          proposalEmail: { ...empty },
          reminderEmail: { ...empty },
        },
        supersedeProposalId: data.supersedeActive ? review.activeProposalId : null,
        orderExpectedVersion: order.version,
        orderEvents: [createdEvent],
        createdByUserId: auth.kind === 'admin' && Number.isSafeInteger(Number(auth.adminId)) ? Number(auth.adminId) : null,
      },
      auth,
    )
    await dispatchProposalEmail(proposal, 'proposal')
    return (await getProposal(proposal.id, auth)) ?? proposal
  },

  /** Read-only: safe for GET. Exposes only what the decision page needs. */
  async getDecisionView(token: string): Promise<DecisionView> {
    if (token.length < 20 || token.length > 200) return { state: 'invalid' }
    const proposal = await getProposalByTokenHash(sha256(token))
    if (!proposal || proposal.isDemo) return { state: 'invalid' }
    const order = await getOrder(proposal.orderReference, DECISION_AUTH)
    if (!order) return { state: 'invalid' }
    const deadlines = priceChangeService.getDeadlines(proposal)
    // Display-only: a pending proposal past its final deadline is shown as expired (no mutation on GET).
    const overdue = proposal.status === 'pending' && deadlines.expiresAt !== null && clock.nowIso() >= deadlines.expiresAt
    return {
      state: overdue ? 'expired' : proposal.status,
      orderReference: order.reference,
      customerName: order.submission.customer.name,
      lines: proposal.lines,
      originalTotals: proposal.originalTotals,
      proposedTotals: proposal.proposedTotals,
      explanation: proposal.explanation,
      deadlines,
    }
  },

  /** Explicit customer decision (POST only). Competes atomically with expiry and supersession. */
  async decide(input: unknown): Promise<DecisionResult> {
    const parsed = decisionSchema.safeParse(input)
    if (!parsed.success) return { outcome: 'invalid' }
    const proposal = await getProposalByTokenHash(sha256(parsed.data.token))
    if (!proposal || proposal.isDemo) return { outcome: 'invalid' }
    if (proposal.status !== 'pending') return { outcome: 'already_resolved', status: proposal.status }

    // A decision after the final deadline loses even if the scheduler has not run yet.
    const expiresAt = priceChangeService.getDeadlines(proposal).expiresAt
    if (expiresAt && clock.nowIso() >= expiresAt) {
      await expireProposal(proposal.id, DECISION_AUTH)
      const latest = await getProposalByTokenHash(sha256(parsed.data.token))
      return { outcome: 'already_resolved', status: latest?.status ?? 'expired' }
    }

    const now = clock.nowIso()
    const accept = parsed.data.decision === 'accept'
    const customer = { type: 'customer', label: 'ügyfél (döntési oldal)' } as const
    let jobId: number | null = null
    const result = await resolveProposal(
      {
        proposalId: proposal.id,
        outcome: accept ? 'accepted' : 'rejected',
        at: now,
        orderPatch: accept
          ? {
              priceApprovalStatus: 'accepted',
              needsPriceReview: false,
              // The submission snapshot (original prices) is never touched; only the agreed prices change.
              agreed: {
                lines: proposal.lines.map((line: ProposalLine) => ({ lineId: line.lineId, unitPrice: line.proposedUnitPrice, lineTotal: multiplyHuf(line.proposedUnitPrice, line.quantity) })),
                totals: proposal.proposedTotals,
                source: 'price_change',
                proposalId: proposal.id,
                agreedAt: now,
              },
              appendEvents: [
                { type: 'proposal_accepted', actor: customer, message: 'Az ügyfél elfogadta az árváltozást.', previousValue: { grandTotal: proposal.originalTotals.grandTotal }, newValue: { grandTotal: proposal.proposedTotals.grandTotal } },
              ],
            }
          : {
              priceApprovalStatus: 'rejected',
              fulfillmentStatus: 'cancelled',
              paymentStatus: 'void',
              cancellation: { reason: 'price_change_rejected', note: null, at: now },
              skipStatusNotification: true,
              appendEvents: [
                { type: 'proposal_rejected', actor: customer, message: 'Az ügyfél elutasította az árváltozást.' },
                { type: 'cancelled', actor: { type: 'system', label: 'árváltozás' }, message: 'A teljes rendelés törölve (árváltozás elutasítva).', newValue: 'cancelled', reason: 'Árváltozás elutasítva' },
              ],
            },
        inTransaction: async (req: PayloadRequest, resolved: PriceChangeProposal, orderId: number): Promise<void> => {
          jobId = (await queueDecisionEmail(req, resolved, orderId, accept ? 'price-change-accepted' : 'cancelled-after-rejection')).id
        },
      },
      DECISION_AUTH,
    )
    if (!result.won) return { outcome: 'already_resolved', status: result.proposal.status }
    if (jobId !== null) await notificationService.deliver([jobId])
    return { outcome: accept ? 'accepted' : 'rejected' }
  },

  /**
   * One scheduler tick. Safe to run repeatedly and concurrently (claims, row locks, idempotent jobs):
   * - proposal email not yet accepted → (re)try through its job (no period runs until accepted)
   * - 24 h after the accepted proposal email → send exactly one reminder (same job on retry)
   * - 24 h after the accepted reminder → expire atomically and cancel the whole order
   * Demo proposals are never loaded.
   */
  async processDueProposals(auth: AuthorizationContext): Promise<SchedulerReport> {
    assertAdminOrSystem(auth)
    const report: SchedulerReport = { ranAt: clock.nowIso(), proposalEmailsSent: 0, remindersSent: 0, expired: 0, failures: 0 }
    for (const proposal of await getPendingProposals(auth)) {
      const now = clock.nowIso()
      const deadlines = priceChangeService.getDeadlines(proposal)
      if (!proposal.proposalEmail.sentAt) {
        const outcome = await dispatchProposalEmail(proposal, 'proposal')
        if (outcome === 'sent') report.proposalEmailsSent += 1
        if (outcome === 'failed') report.failures += 1
        continue
      }
      if (!proposal.reminderEmail.sentAt) {
        if (deadlines.reminderDueAt && now >= deadlines.reminderDueAt) {
          const outcome = await dispatchProposalEmail(proposal, 'reminder')
          if (outcome === 'sent') report.remindersSent += 1
          if (outcome === 'failed') report.failures += 1
        }
        continue
      }
      if (deadlines.expiresAt && now >= deadlines.expiresAt && (await expireProposal(proposal.id, auth))) report.expired += 1
    }
    return report
  },
}
