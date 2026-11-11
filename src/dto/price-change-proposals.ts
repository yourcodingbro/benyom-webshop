import 'server-only'

import { assertAdminOrSystem } from '@/lib/authorization'
import { randomToken } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { applyOrderPatch } from '@/dto/orders'
import { copy, sampleStore } from '@/dto/sample-store'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'
import type { Order, OrderEvent, OrderPatch } from '@/types/order'
import type { EmailDispatchState, EmailKind, PriceChangeProposal, ProposalOutcome } from '@/types/proposal'

/*
 * Price-change proposal persistence. Every function that changes state is an atomic
 * contract: check and write happen in one synchronous step here; with Payload they
 * must run inside one database transaction (or a conditional UPDATE ... WHERE status = 'pending').
 */

export type NewProposal = Omit<PriceChangeProposal, 'id' | 'status' | 'resolvedAt' | 'supersedesId' | 'supersededById' | 'version'>

export type AddProposalInput = {
  proposal: NewProposal
  /** Must equal the currently active proposal id to replace it; null when none may exist. */
  supersedeProposalId: string | null
  /** Order must not have changed since eligibility was checked. */
  orderExpectedVersion: number
  orderEvents: OrderEvent[]
}

export type ResolveProposalInput = {
  proposalId: string
  outcome: ProposalOutcome
  at: IsoDateTime
  /** Applied to the order only if this call wins the transition. */
  orderPatch: OrderPatch
}

export type ResolveProposalResult = {
  /** false when another transition (decision, expiry, supersession) already happened. */
  won: boolean
  proposal: PriceChangeProposal
  order: Order
}

export type EmailAttemptResult = { ok: true; sentAt: IsoDateTime; tokenHash: string | null } | { ok: false; attemptedAt: IsoDateTime; error: string }

function findOrderRecord(reference: string): Order {
  const order = sampleStore().orders.find((item: Order) => item.reference === reference)
  if (!order) throw new AppError('NOT_FOUND', 'A rendelés nem található.')
  return order
}

function findProposalRecord(id: string): PriceChangeProposal {
  const proposal = sampleStore().proposals.find((item: PriceChangeProposal) => item.id === id)
  if (!proposal) throw new AppError('NOT_FOUND', 'Az árváltozási ajánlat nem található.')
  return proposal
}

function dispatchState(proposal: PriceChangeProposal, kind: EmailKind): EmailDispatchState {
  return kind === 'proposal' ? proposal.proposalEmail : proposal.reminderEmail
}

/** Atomically supersedes the active proposal (if explicitly requested), inserts the new one and holds the order. */
export async function addProposal(input: AddProposalInput, auth: AuthorizationContext): Promise<PriceChangeProposal> {
  assertAdminOrSystem(auth)
  const store = sampleStore()
  const order = findOrderRecord(input.proposal.orderReference)
  if (order.version !== input.orderExpectedVersion) {
    throw new AppError('CONFLICT', 'A rendelést időközben módosították. Frissítse az oldalt, és próbálja újra.')
  }
  const active = store.proposals.find((item: PriceChangeProposal) => item.orderReference === order.reference && item.status === 'pending')
  if (active && active.id !== input.supersedeProposalId) {
    throw new AppError('CONFLICT', 'A rendeléshez már tartozik aktív árváltozási ajánlat. Felülírásához kifejezett megerősítés szükséges.')
  }
  if (!active && input.supersedeProposalId) {
    throw new AppError('CONFLICT', 'A felülírandó ajánlat már nem aktív.')
  }

  const now = input.proposal.createdAt
  const proposal: PriceChangeProposal = {
    ...copy(input.proposal),
    id: `prop-${randomToken(9)}`,
    status: 'pending',
    resolvedAt: null,
    supersedesId: active?.id ?? null,
    supersededById: null,
    version: 1,
  }
  const events = [...input.orderEvents]
  if (active) {
    active.status = 'superseded'
    active.resolvedAt = now
    active.supersededById = proposal.id
    active.version += 1
    events.unshift({
      id: `ev-${randomToken(6)}`,
      at: now,
      type: 'proposal_superseded',
      actor: 'admin',
      message: `A(z) ${active.id} ajánlatot felülírta a(z) ${proposal.id} ajánlat; a korábbi döntési linkek érvénytelenek.`,
    })
  }
  store.proposals.push(proposal)
  applyOrderPatch(order, { priceApprovalStatus: 'pending', appendEvents: events }, now)
  return copy(proposal)
}

export async function getProposal(id: string, auth: AuthorizationContext): Promise<PriceChangeProposal | null> {
  assertAdminOrSystem(auth)
  const proposal = sampleStore().proposals.find((item: PriceChangeProposal) => item.id === id)
  return proposal ? copy(proposal) : null
}

export async function getProposalsForOrder(reference: string, auth: AuthorizationContext): Promise<PriceChangeProposal[]> {
  assertAdminOrSystem(auth)
  return copy(sampleStore().proposals.filter((item: PriceChangeProposal) => item.orderReference === reference))
}

export async function getActiveProposal(reference: string, auth: AuthorizationContext): Promise<PriceChangeProposal | null> {
  assertAdminOrSystem(auth)
  const proposal = sampleStore().proposals.find((item: PriceChangeProposal) => item.orderReference === reference && item.status === 'pending')
  return proposal ? copy(proposal) : null
}

export async function getPendingProposals(auth: AuthorizationContext): Promise<PriceChangeProposal[]> {
  assertAdminOrSystem(auth)
  return copy(sampleStore().proposals.filter((item: PriceChangeProposal) => item.status === 'pending'))
}

/** The token hash is the credential: the caller proves possession of the raw token. */
export async function getProposalByTokenHash(tokenHash: string): Promise<PriceChangeProposal | null> {
  const proposal = sampleStore().proposals.find((item: PriceChangeProposal) => item.tokenHashes.includes(tokenHash))
  return proposal ? copy(proposal) : null
}

/**
 * Claims the right to send one proposal email. Fails if the proposal is no longer pending,
 * the email was already sent, or another sender holds a fresh claim (duplicate protection).
 */
export async function claimProposalEmail(
  proposalId: string,
  kind: EmailKind,
  now: IsoDateTime,
  staleBefore: IsoDateTime,
  auth: AuthorizationContext,
): Promise<boolean> {
  assertAdminOrSystem(auth)
  const proposal = findProposalRecord(proposalId)
  const state = dispatchState(proposal, kind)
  if (proposal.status !== 'pending' || state.sentAt !== null) return false
  if (state.claimedAt !== null && state.claimedAt > staleBefore) return false
  state.claimedAt = now
  state.firstAttemptAt ??= now
  proposal.version += 1
  return true
}

/** Records the result of a claimed send and releases the claim. */
export async function completeProposalEmail(
  proposalId: string,
  kind: EmailKind,
  result: EmailAttemptResult,
  auth: AuthorizationContext,
): Promise<PriceChangeProposal> {
  assertAdminOrSystem(auth)
  const proposal = findProposalRecord(proposalId)
  const state = dispatchState(proposal, kind)
  state.attempts += 1
  state.claimedAt = null
  if (result.ok) {
    state.sentAt ??= result.sentAt
    state.lastAttemptAt = result.sentAt
    state.lastError = null
    if (result.tokenHash) proposal.tokenHashes.push(result.tokenHash)
  } else {
    state.lastAttemptAt = result.attemptedAt
    state.lastError = result.error
  }
  proposal.version += 1
  return copy(proposal)
}

/**
 * Competing terminal transition (accept / reject / expire / withdraw). Exactly one caller
 * can move a proposal out of `pending`; the order patch is applied only for the winner.
 */
export async function resolveProposal(input: ResolveProposalInput, auth: AuthorizationContext): Promise<ResolveProposalResult> {
  assertAdminOrSystem(auth)
  const proposal = findProposalRecord(input.proposalId)
  const order = findOrderRecord(proposal.orderReference)
  if (proposal.status !== 'pending') return { won: false, proposal: copy(proposal), order: copy(order) }
  proposal.status = input.outcome
  proposal.resolvedAt = input.at
  proposal.version += 1
  applyOrderPatch(order, input.orderPatch, input.at)
  return { won: true, proposal: copy(proposal), order: copy(order) }
}
