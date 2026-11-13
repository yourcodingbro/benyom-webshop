import 'server-only'

import type { PayloadRequest, Where } from 'payload'

import { lockRow } from '@/collections/hooks/db'
import { patchOrderInTransaction } from '@/dto/orders'
import { payloadClient, withTransaction } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { randomToken } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import type { PriceChangeProposal as ProposalDoc } from '@/payload-types'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'
import type { OrderPatch, OrderTotals } from '@/types/order'
import type { EmailDispatchState, EmailKind, PriceChangeProposal, ProposalOutcome } from '@/types/proposal'
import type { AuditEventInput } from '@/types/workflow'

/*
 * Price-change proposal persistence. Every state change runs in one database transaction under row
 * locks (order and/or proposal), so concurrent decisions, expiry and supersession cannot both win.
 */

export type NewProposal = Omit<PriceChangeProposal, 'id' | 'status' | 'resolvedAt' | 'supersedesId' | 'supersededById' | 'version' | 'isDemo' | 'tokenHashes'>

export type AddProposalInput = {
  proposal: NewProposal
  /** Must equal the currently active proposal id to replace it; null when none may exist. */
  supersedeProposalId: string | null
  /** Order must not have changed since eligibility was checked. */
  orderExpectedVersion: number
  orderEvents: AuditEventInput[]
  /** The admin who created it (Payload user id), for the admin UI. */
  createdByUserId: number | null
}

export type ResolveProposalInput = {
  proposalId: string
  outcome: ProposalOutcome
  at: IsoDateTime
  /** Applied to the order only if this call wins the transition. */
  orderPatch: OrderPatch
  /** Runs in the same transaction only for the winner (e.g. queue the decision email). */
  inTransaction?: (req: PayloadRequest, proposal: PriceChangeProposal, orderId: number) => Promise<void>
}

export type ResolveProposalResult = {
  /** false when another transition (decision, expiry, supersession) already happened. */
  won: boolean
  proposal: PriceChangeProposal
  orderReference: string
}

export type EmailAttemptResult =
  /** The provider accepted the email: the response period starts now. */
  | { kind: 'accepted'; at: IsoDateTime; tokenHash: string }
  /** Logging mode: rendered, not sent; no period starts. */
  | { kind: 'simulated'; at: IsoDateTime; note: string }
  | { kind: 'failed'; at: IsoDateTime; error: string }

function dispatch(group: ProposalDoc['proposalEmail']): EmailDispatchState {
  return {
    attempts: group?.attempts ?? 0,
    firstAttemptAt: group?.firstAttemptAt ?? null,
    lastAttemptAt: group?.lastAttemptAt ?? null,
    lastError: group?.lastError ?? null,
    claimedAt: group?.claimedAt ?? null,
    sentAt: group?.sentAt ?? null,
  }
}

function totals(group: ProposalDoc['originalTotals']): OrderTotals {
  return { itemsTotal: group.itemsTotal, deliveryFee: group.deliveryFee, grandTotal: group.grandTotal, currency: 'HUF' }
}

function toProposal(doc: ProposalDoc): PriceChangeProposal {
  return {
    id: doc.id,
    orderReference: doc.orderReference,
    status: doc.status,
    lines: doc.lines.map((line) => ({
      lineId: line.lineId,
      sku: line.sku ?? '',
      productName: line.productName ?? '',
      quantity: line.quantity ?? 0,
      originalUnitPrice: line.originalUnitPrice,
      proposedUnitPrice: line.proposedUnitPrice,
    })),
    originalTotals: totals(doc.originalTotals),
    proposedTotals: totals(doc.proposedTotals),
    explanation: doc.explanation,
    tokenHashes: [doc.proposalTokenHash, doc.reminderTokenHash].filter((hash): hash is string => typeof hash === 'string' && hash.length > 0),
    createdAt: doc.createdAt,
    createdBy: doc.createdBy ?? '',
    proposalEmail: dispatch(doc.proposalEmail),
    reminderEmail: dispatch(doc.reminderEmail),
    resolvedAt: doc.resolvedAt ?? null,
    supersedesId: doc.supersedesId ?? null,
    supersededById: doc.supersededById ?? null,
    version: doc.version ?? 1,
    isDemo: Boolean(doc.isDemo),
  }
}

async function findOne(where: Where, req?: PayloadRequest): Promise<ProposalDoc | null> {
  const payload = req?.payload ?? (await payloadClient())
  const result = await payload.find({ collection: 'price-change-proposals', where, limit: 1, depth: 0, overrideAccess: true, req })
  return result.docs[0] ?? null
}

async function findMany(where: Where, req?: PayloadRequest): Promise<ProposalDoc[]> {
  const payload = req?.payload ?? (await payloadClient())
  const result = await payload.find({ collection: 'price-change-proposals', where, sort: 'createdAt', pagination: false, depth: 0, overrideAccess: true, req })
  return result.docs
}

/** Atomically supersedes the active proposal (if explicitly requested), inserts the new one and holds the order. */
export async function addProposal(input: AddProposalInput, auth: AuthorizationContext): Promise<PriceChangeProposal> {
  assertAdminOrSystem(auth)
  return withTransaction(async (req: PayloadRequest): Promise<PriceChangeProposal> => {
    const reference = input.proposal.orderReference
    const orders = await req.payload.find({ collection: 'orders', where: { reference: { equals: reference } }, limit: 1, depth: 0, overrideAccess: true, req })
    const orderDoc = orders.docs[0]
    if (!orderDoc) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
    if (orderDoc.isDemo) throw new AppError('INVALID_STATE', 'Demó (történeti) rendeléshez nem küldhető árváltozási ajánlat.')
    const locked = await lockRow(req, 'orders', orderDoc.id)
    if (!locked || Number(locked.version) !== input.orderExpectedVersion) {
      throw new AppError('CONFLICT', 'A rendelést időközben módosították. Frissítse az oldalt, és próbálja újra.')
    }
    // Read after the lock: a concurrent creator has either committed (visible here) or not started.
    const active = await findOne({ and: [{ orderReference: { equals: reference } }, { status: { equals: 'pending' } }] }, req)
    if (active && active.id !== input.supersedeProposalId) {
      throw new AppError('CONFLICT', 'A rendeléshez már tartozik aktív árváltozási ajánlat. Felülírásához kifejezett megerősítés szükséges.')
    }
    if (!active && input.supersedeProposalId) throw new AppError('CONFLICT', 'A felülírandó ajánlat már nem aktív.')

    const now = input.proposal.createdAt
    const id = `prop-${randomToken(9).replace(/[^A-Za-z0-9]/g, 'x')}`
    const events: AuditEventInput[] = []
    if (active) {
      await req.payload.update({
        collection: 'price-change-proposals',
        id: active.id,
        data: { status: 'superseded', resolvedAt: now, supersededById: id, version: (active.version ?? 1) + 1 },
        req,
        overrideAccess: true,
      })
      events.push({ type: 'proposal_superseded', actor: input.orderEvents[0]?.actor ?? { type: 'system', label: 'ajánlatok' }, message: `A(z) ${active.id} ajánlatot felülírta a(z) ${id} ajánlat; a korábbi döntési linkek érvénytelenek.`, proposalId: active.id })
    }
    const empty = { attempts: 0, firstAttemptAt: null, lastAttemptAt: null, lastError: null, claimedAt: null, sentAt: null }
    const created = await req.payload.create({
      collection: 'price-change-proposals',
      data: {
        id,
        order: orderDoc.id,
        orderReference: reference,
        status: 'pending',
        isDemo: false,
        version: 1,
        explanation: input.proposal.explanation,
        lines: input.proposal.lines,
        originalTotals: input.proposal.originalTotals,
        proposedTotals: input.proposal.proposedTotals,
        proposalEmail: empty,
        reminderEmail: empty,
        supersedesId: active?.id ?? null,
        createdBy: input.proposal.createdBy,
        createdByUser: input.createdByUserId,
      },
      req,
      overrideAccess: true,
    })
    events.push(...input.orderEvents.map((event: AuditEventInput) => ({ ...event, proposalId: id })))
    await patchOrderInTransaction(req, reference, null, { priceApprovalStatus: 'pending', appendEvents: events })
    return toProposal(created)
  })
}

export async function getProposal(id: string, auth: AuthorizationContext): Promise<PriceChangeProposal | null> {
  assertAdminOrSystem(auth)
  const doc = await findOne({ id: { equals: id } })
  return doc ? toProposal(doc) : null
}

export async function getProposalsForOrder(reference: string, auth: AuthorizationContext): Promise<PriceChangeProposal[]> {
  assertAdminOrSystem(auth)
  return (await findMany({ orderReference: { equals: reference } })).map(toProposal)
}

export async function getActiveProposal(reference: string, auth: AuthorizationContext): Promise<PriceChangeProposal | null> {
  assertAdminOrSystem(auth)
  const doc = await findOne({ and: [{ orderReference: { equals: reference } }, { status: { equals: 'pending' } }] })
  return doc ? toProposal(doc) : null
}

/** Pending live proposals for the scheduler. Historical demo proposals are never returned. */
export async function getPendingProposals(auth: AuthorizationContext): Promise<PriceChangeProposal[]> {
  assertAdminOrSystem(auth)
  return (await findMany({ and: [{ status: { equals: 'pending' } }, { isDemo: { not_equals: true } }] })).map(toProposal)
}

/** The token hash is the credential: the caller proves possession of the raw token. */
export async function getProposalByTokenHash(tokenHash: string): Promise<PriceChangeProposal | null> {
  const doc = await findOne({ or: [{ proposalTokenHash: { equals: tokenHash } }, { reminderTokenHash: { equals: tokenHash } }] })
  return doc ? toProposal(doc) : null
}

/**
 * Records one proposal/reminder email attempt inside the email job's transaction. Only an accepted
 * email sets `sentAt` (the period start) and stores the token hash; `sentAt` is never moved later by
 * a duplicate. Logging mode and failures never start a period.
 */
export async function recordProposalEmailAttempt(req: PayloadRequest, proposalId: string, kind: EmailKind, result: EmailAttemptResult): Promise<void> {
  const locked = await lockRow(req, 'price-change-proposals', proposalId)
  if (!locked) return
  const doc = await findOne({ id: { equals: proposalId } }, req)
  if (!doc) return
  const field = kind === 'proposal' ? 'proposalEmail' : 'reminderEmail'
  const state = dispatch(doc[field])
  const next: EmailDispatchState = {
    ...state,
    attempts: state.attempts + 1,
    firstAttemptAt: state.firstAttemptAt ?? result.at,
    lastAttemptAt: result.at,
    claimedAt: null,
    lastError: result.kind === 'failed' ? result.error : result.kind === 'simulated' ? result.note : null,
    sentAt: result.kind === 'accepted' ? (state.sentAt ?? result.at) : state.sentAt,
  }
  await req.payload.update({
    collection: 'price-change-proposals',
    id: proposalId,
    data: {
      [field]: next,
      ...(result.kind === 'accepted' ? { [kind === 'proposal' ? 'proposalTokenHash' : 'reminderTokenHash']: result.tokenHash } : {}),
      version: (doc.version ?? 1) + 1,
    },
    req,
    overrideAccess: true,
  })
}

/** Anchors the deadline printed in the email: the first attempt time, stable across retries. */
export async function markProposalEmailAttemptStarted(req: PayloadRequest, proposalId: string, kind: EmailKind, at: IsoDateTime): Promise<IsoDateTime> {
  const locked = await lockRow(req, 'price-change-proposals', proposalId)
  if (!locked) throw new AppError('NOT_FOUND', 'Az árváltozási ajánlat nem található.')
  const doc = await findOne({ id: { equals: proposalId } }, req)
  if (!doc) throw new AppError('NOT_FOUND', 'Az árváltozási ajánlat nem található.')
  const field = kind === 'proposal' ? 'proposalEmail' : 'reminderEmail'
  const state = dispatch(doc[field])
  if (state.firstAttemptAt) return state.firstAttemptAt
  await req.payload.update({ collection: 'price-change-proposals', id: proposalId, data: { [field]: { ...state, firstAttemptAt: at } }, req, overrideAccess: true })
  return at
}

/**
 * Competing terminal transition (accept / reject / expire / withdraw). Exactly one caller can move a
 * proposal out of `pending` (row lock + status check); the order patch and `inTransaction` run only
 * for the winner, in the same transaction.
 */
export async function resolveProposal(input: ResolveProposalInput, auth: AuthorizationContext): Promise<ResolveProposalResult> {
  assertAdminOrSystem(auth)
  return withTransaction(async (req: PayloadRequest): Promise<ResolveProposalResult> => {
    const locked = await lockRow(req, 'price-change-proposals', input.proposalId)
    if (!locked) throw new AppError('NOT_FOUND', 'Az árváltozási ajánlat nem található.')
    const doc = await findOne({ id: { equals: input.proposalId } }, req)
    if (!doc) throw new AppError('NOT_FOUND', 'Az árváltozási ajánlat nem található.')
    if (doc.status !== 'pending' || doc.isDemo) return { won: false, proposal: toProposal(doc), orderReference: doc.orderReference }
    const updated = await req.payload.update({
      collection: 'price-change-proposals',
      id: doc.id,
      data: { status: input.outcome, resolvedAt: input.at, version: (doc.version ?? 1) + 1 },
      req,
      overrideAccess: true,
    })
    const order = await patchOrderInTransaction(req, doc.orderReference, null, {
      ...input.orderPatch,
      appendEvents: (input.orderPatch.appendEvents ?? []).map((event: AuditEventInput) => ({ ...event, proposalId: event.proposalId ?? doc.id })),
    })
    const proposal = toProposal(updated)
    if (input.inTransaction) await input.inTransaction(req, proposal, order.id)
    return { won: true, proposal, orderReference: doc.orderReference }
  })
}


/** Anchors (once) and returns the first-attempt time that the email's printed deadline is based on. */
export async function anchorProposalEmail(proposalId: string, kind: EmailKind, at: IsoDateTime, auth: AuthorizationContext): Promise<IsoDateTime> {
  assertAdminOrSystem(auth)
  return withTransaction((req: PayloadRequest) => markProposalEmailAttemptStarted(req, proposalId, kind, at))
}
