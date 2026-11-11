import 'server-only'

import { PROPOSAL_INELIGIBLE_STATUSES } from '@/config/order-rules'
import { getSiteUrl } from '@/config/runtime'
import { EMAIL_CLAIM_STALE_MINUTES, PROPOSAL_FINAL_WINDOW_HOURS, PROPOSAL_REMINDER_AFTER_HOURS } from '@/config/shop'
import { getOrder } from '@/dto/orders'
import {
  addProposal,
  claimProposalEmail,
  completeProposalEmail,
  getActiveProposal,
  getPendingProposals,
  getProposal,
  getProposalByTokenHash,
  resolveProposal,
} from '@/dto/price-change-proposals'
import { getStoreSettings } from '@/dto/settings'
import { assertAdminOrSystem } from '@/lib/authorization'
import { addHours, clock } from '@/lib/clock'
import { randomToken, sha256 } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { multiplyHuf, sumHuf } from '@/lib/money'
import { createProposalSchema, decisionSchema } from '@/schemas/proposal'
import { notificationService } from '@/services/notificationService'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'
import type { Order, OrderEvent, OrderTotals } from '@/types/order'
import type { EmailKind, PriceChangeProposal, ProposalLine, ProposalStatus } from '@/types/proposal'

export type ProposalDeadlines = {
  /** When the reminder becomes due (24 h after the proposal email was successfully sent). */
  reminderDueAt: IsoDateTime | null
  /** Final cancellation time (24 h after the reminder was successfully sent). */
  expiresAt: IsoDateTime | null
  /** Earliest possible cancellation if the reminder is sent exactly on time. */
  earliestCancellationAt: IsoDateTime | null
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
  createProposal: (input: unknown, auth: AuthorizationContext) => Promise<PriceChangeProposal>
  getDecisionView: (token: string) => Promise<DecisionView>
  decide: (input: unknown) => Promise<DecisionResult>
  processDueProposals: (auth: AuthorizationContext) => Promise<SchedulerReport>
  getDeadlines: (proposal: PriceChangeProposal) => ProposalDeadlines
}

const DECISION_AUTH: AuthorizationContext = { kind: 'system', process: 'customer-decision' }
const INELIGIBLE: ReadonlySet<Order['fulfillmentStatus']> = new Set(PROPOSAL_INELIGIBLE_STATUSES)

function event(type: OrderEvent['type'], actor: OrderEvent['actor'], message: string, at: IsoDateTime): OrderEvent {
  return { id: `ev-${randomToken(6)}`, at, type, actor, message }
}

function decisionUrl(token: string): string {
  return `${getSiteUrl()}/arvaltozas/${token}`
}

async function requireOrder(reference: string, auth: AuthorizationContext): Promise<Order> {
  const order = await getOrder(reference, auth)
  if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  return order
}

/**
 * Sends the proposal or reminder email under a claim, so concurrent scheduler runs or
 * retries cannot send twice. A fresh decision token is issued per email; only its hash is
 * stored, and only once the send succeeded. A failed attempt does not start any period.
 */
async function dispatchProposalEmail(proposalId: string, kind: EmailKind, auth: AuthorizationContext): Promise<'sent' | 'failed' | 'skipped'> {
  const now = clock.nowIso()
  const staleBefore = new Date(clock.now().getTime() - EMAIL_CLAIM_STALE_MINUTES * 60_000).toISOString()
  if (!(await claimProposalEmail(proposalId, kind, now, staleBefore, auth))) return 'skipped'

  const proposal = await getProposal(proposalId, auth)
  if (!proposal) return 'skipped'
  const order = await requireOrder(proposal.orderReference, auth)
  const settings = await getStoreSettings()
  const token = randomToken(32)
  const url = decisionUrl(token)
  const result = await notificationService.notify({
    order,
    template:
      kind === 'proposal'
        ? { id: 'price-change-proposal', order, proposal, decisionUrl: url, earliestCancellation: addHours(now, PROPOSAL_REMINDER_AFTER_HOURS + PROPOSAL_FINAL_WINDOW_HOURS) }
        : { id: 'price-change-reminder', order, proposal, decisionUrl: url, deadline: addHours(now, PROPOSAL_FINAL_WINDOW_HOURS) },
    recipientRole: 'customer',
    settings,
    proposalId,
  })
  await completeProposalEmail(
    proposalId,
    kind,
    result.status === 'sent_simulated'
      ? { ok: true, sentAt: result.sentAt, tokenHash: sha256(token) }
      : { ok: false, attemptedAt: result.attemptedAt, error: result.error },
    auth,
  )
  return result.status === 'sent_simulated' ? 'sent' : 'failed'
}

export const priceChangeService: PriceChangeService = {
  getDeadlines(proposal: PriceChangeProposal): ProposalDeadlines {
    const sentAt = proposal.proposalEmail.sentAt
    const reminderAt = proposal.reminderEmail.sentAt
    return {
      reminderDueAt: sentAt ? addHours(sentAt, PROPOSAL_REMINDER_AFTER_HOURS) : null,
      expiresAt: reminderAt ? addHours(reminderAt, PROPOSAL_FINAL_WINDOW_HOURS) : null,
      earliestCancellationAt: sentAt ? addHours(sentAt, PROPOSAL_REMINDER_AFTER_HOURS + PROPOSAL_FINAL_WINDOW_HOURS) : null,
    }
  },

  async createProposal(input: unknown, auth: AuthorizationContext): Promise<PriceChangeProposal> {
    assertAdminOrSystem(auth)
    const parsed = createProposalSchema.safeParse(input)
    if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Érvénytelen ajánlat.')
    const data = parsed.data
    const order = await requireOrder(data.orderReference, auth)
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
    const now = clock.nowIso()
    const emptyDispatch = { attempts: 0, lastAttemptAt: null, lastError: null, claimedAt: null, sentAt: null }

    const proposal = await addProposal(
      {
        proposal: {
          orderReference: order.reference,
          lines,
          originalTotals: order.agreed.totals,
          proposedTotals: { itemsTotal, deliveryFee, grandTotal: sumHuf([itemsTotal, deliveryFee]), currency: 'HUF' },
          explanation: data.explanation,
          tokenHashes: [],
          createdAt: now,
          createdBy: auth.kind === 'admin' ? auth.adminId : auth.kind,
          proposalEmail: { ...emptyDispatch },
          reminderEmail: { ...emptyDispatch },
        },
        supersedeProposalId: data.supersedeActive ? (active?.id ?? null) : null,
        orderExpectedVersion: order.version,
        orderEvents: [event('proposal_created', 'admin', 'Árváltozási ajánlat létrehozva; a teljesítés az ügyfél döntéséig szünetel.', now)],
      },
      auth,
    )
    await dispatchProposalEmail(proposal.id, 'proposal', auth)
    return (await getProposal(proposal.id, auth)) ?? proposal
  },

  /** Read-only: safe for GET. Exposes only what the decision page needs. */
  async getDecisionView(token: string): Promise<DecisionView> {
    if (token.length < 20 || token.length > 200) return { state: 'invalid' }
    const proposal = await getProposalByTokenHash(sha256(token))
    if (!proposal) return { state: 'invalid' }
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

  /** Explicit customer decision (POST only). Competes atomically with expiry. */
  async decide(input: unknown): Promise<DecisionResult> {
    const parsed = decisionSchema.safeParse(input)
    if (!parsed.success) return { outcome: 'invalid' }
    const proposal = await getProposalByTokenHash(sha256(parsed.data.token))
    if (!proposal) return { outcome: 'invalid' }
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
    const result = await resolveProposal(
      {
        proposalId: proposal.id,
        outcome: accept ? 'accepted' : 'rejected',
        at: now,
        orderPatch: accept
          ? {
              priceApprovalStatus: 'accepted',
              needsPriceReview: false,
              agreed: {
                lines: proposal.lines.map((line: ProposalLine) => ({
                  lineId: line.lineId,
                  unitPrice: line.proposedUnitPrice,
                  lineTotal: multiplyHuf(line.proposedUnitPrice, line.quantity),
                })),
                totals: proposal.proposedTotals,
                source: 'price_change',
                proposalId: proposal.id,
                agreedAt: now,
              },
              appendEvents: [event('proposal_accepted', 'customer', 'Az ügyfél elfogadta az árváltozást.', now)],
            }
          : {
              priceApprovalStatus: 'rejected',
              fulfillmentStatus: 'cancelled',
              paymentStatus: 'void',
              cancellation: { reason: 'price_change_rejected', note: null, at: now },
              appendEvents: [
                event('proposal_rejected', 'customer', 'Az ügyfél elutasította az árváltozást.', now),
                event('cancelled', 'system', 'A teljes rendelés törölve (árváltozás elutasítva).', now),
              ],
            },
      },
      DECISION_AUTH,
    )
    if (!result.won) return { outcome: 'already_resolved', status: result.proposal.status }

    const settings = await getStoreSettings()
    await notificationService.notify({
      order: result.order,
      template: accept ? { id: 'price-change-accepted', order: result.order, proposal: result.proposal } : { id: 'cancelled-after-rejection', order: result.order },
      recipientRole: 'customer',
      settings,
      proposalId: proposal.id,
    })
    return { outcome: accept ? 'accepted' : 'rejected' }
  },

  /**
   * One scheduler tick. Safe to run repeatedly and concurrently:
   * - unsent proposal email → (re)try sending; no period runs until it succeeds
   * - 24 h after successful proposal email → send one reminder (retry on failure)
   * - 24 h after successful reminder → expire atomically and cancel the whole order
   */
  async processDueProposals(auth: AuthorizationContext): Promise<SchedulerReport> {
    assertAdminOrSystem(auth)
    const report: SchedulerReport = { ranAt: clock.nowIso(), proposalEmailsSent: 0, remindersSent: 0, expired: 0, failures: 0 }
    for (const proposal of await getPendingProposals(auth)) {
      const now = clock.nowIso()
      const deadlines = priceChangeService.getDeadlines(proposal)

      if (!proposal.proposalEmail.sentAt) {
        const outcome = await dispatchProposalEmail(proposal.id, 'proposal', auth)
        if (outcome === 'sent') report.proposalEmailsSent += 1
        if (outcome === 'failed') report.failures += 1
        continue
      }
      if (!proposal.reminderEmail.sentAt) {
        if (deadlines.reminderDueAt && now >= deadlines.reminderDueAt) {
          const outcome = await dispatchProposalEmail(proposal.id, 'reminder', auth)
          if (outcome === 'sent') report.remindersSent += 1
          if (outcome === 'failed') report.failures += 1
        }
        continue
      }
      if (deadlines.expiresAt && now >= deadlines.expiresAt && (await expireProposal(proposal.id, auth))) {
        report.expired += 1
      }
    }
    return report
  },
}

/** Expiry transition; competes atomically with a customer decision. Returns true if it won. */
async function expireProposal(proposalId: string, auth: AuthorizationContext): Promise<boolean> {
  const now = clock.nowIso()
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
        appendEvents: [
          event('proposal_expired', 'system', 'Az árváltozási ajánlat határideje lejárt.', now),
          event('cancelled', 'system', 'A teljes rendelés törölve (nem érkezett döntés).', now),
        ],
      },
    },
    auth,
  )
  if (result.won) {
    await notificationService.notify({
      order: result.order,
      template: { id: 'cancelled-after-timeout', order: result.order },
      recipientRole: 'customer',
      settings: await getStoreSettings(),
      proposalId,
    })
  }
  return result.won
}
