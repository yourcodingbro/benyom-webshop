import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getEmailLogEntries } from '@/dto/email-log'
import { getOrder } from '@/dto/orders'
import { getProposalsForOrder, resolveProposal } from '@/dto/price-change-proposals'
import { sampleStore } from '@/dto/sample-store'
import { HOUR_MS, clock } from '@/lib/clock'
import { setEmailFailureMode } from '@/lib/dev-simulation'
import { SCHEDULER_AUTH } from '@/lib/authorization'
import { orderService } from '@/services/orderService'
import { priceChangeService } from '@/services/priceChangeService'
import { ADMIN, placeTestOrder, resetWorld } from '@/tests/helpers'
import type { Order } from '@/types/order'

let infoSpy: ReturnType<typeof vi.spyOn>
/** Decision links as the customer receives them: captured from the email template input. */
const sentUrls: string[] = []

beforeEach(async () => {
  resetWorld()
  sentUrls.length = 0
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  const notificationModule = await import('@/services/notificationService')
  const original = notificationModule.notificationService.notify
  vi.spyOn(notificationModule.notificationService, 'notify').mockImplementation(async (input) => {
    if ('decisionUrl' in input.template) sentUrls.push(input.template.decisionUrl)
    return original(input)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function lastToken(): string {
  const url = sentUrls.at(-1)
  if (!url) throw new Error('no decision email sent')
  return url.split('/arvaltozas/')[1] ?? ''
}

async function propose(order: Order, price: number, supersedeActive: boolean = false): Promise<void> {
  const lineId = order.submission.lines[0]?.lineId ?? ''
  await priceChangeService.createProposal({ orderReference: order.reference, lines: [{ lineId, proposedUnitPrice: price }], explanation: 'A beszállítói ár emelkedett.', supersedeActive }, ADMIN)
}

async function reload(order: Order): Promise<Order> {
  const latest = await getOrder(order.reference, ADMIN)
  if (!latest) throw new Error('missing')
  return latest
}

describe('price-change proposals', () => {
  it('holds fulfillment while pending and accepting updates only the agreed price', async () => {
    const order = await placeTestOrder()
    await propose(order, 469990)
    const pending = await reload(order)
    expect(pending.priceApprovalStatus).toBe('pending')
    await expect(orderService.updateFulfillmentStatus({ reference: order.reference, status: 'confirmed', expectedVersion: pending.version }, ADMIN)).rejects.toThrow(/szünetel/)

    expect(await priceChangeService.decide({ token: lastToken(), decision: 'accept' })).toEqual({ outcome: 'accepted' })
    const accepted = await reload(order)
    expect(accepted.agreed.totals.grandTotal).toBe(469990)
    expect(accepted.agreed.source).toBe('price_change')
    expect(accepted.submission).toEqual(order.submission)
    expect(accepted.priceApprovalStatus).toBe('accepted')
    expect(accepted.events.map((event) => event.type)).toContain('proposal_accepted')
  })

  it('rejection cancels the entire order and sends a cancellation email', async () => {
    const order = await placeTestOrder(['APL-IP17-256-01', 'SAM-A57-128-01'])
    await propose(order, 469990)
    expect(await priceChangeService.decide({ token: lastToken(), decision: 'reject' })).toEqual({ outcome: 'rejected' })
    const cancelled = await reload(order)
    expect(cancelled.fulfillmentStatus).toBe('cancelled')
    expect(cancelled.cancellation?.reason).toBe('price_change_rejected')
    expect(cancelled.paymentStatus).toBe('void')
    expect(cancelled.notifications.map((record) => record.templateId)).toContain('cancelled-after-rejection')
  })

  it('rejects proposals for dispatched, completed or cancelled orders', async () => {
    const completed = await getOrder('BNY-MNTA-0001', ADMIN)
    if (!completed) throw new Error('missing sample order')
    await expect(propose(completed, 1)).rejects.toThrow(/nem küldhető/)
  })

  it('sends one reminder after 24 h and cancels 24 h after the reminder was sent', async () => {
    const order = await placeTestOrder()
    await propose(order, 469990)
    clock.advance(23 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).remindersSent).toBe(0)
    clock.advance(1 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).remindersSent).toBe(1)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).remindersSent).toBe(0)
    clock.advance(24 * HOUR_MS - 1)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).expired).toBe(0)
    clock.advance(1)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).expired).toBe(1)
    const cancelled = await reload(order)
    expect(cancelled.cancellation?.reason).toBe('price_change_timeout')
    expect(cancelled.notifications.filter((record) => record.templateId === 'price-change-reminder')).toHaveLength(1)
    expect(cancelled.notifications.map((record) => record.templateId)).toContain('cancelled-after-timeout')
  })

  it('failed sends do not start a response period and are retried', async () => {
    const order = await placeTestOrder()
    setEmailFailureMode({ kind: 'fail-next', remaining: 1 })
    await propose(order, 469990)
    let [proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal?.proposalEmail.sentAt).toBeNull()
    expect(proposal?.proposalEmail.attempts).toBe(1)
    clock.advance(30 * HOUR_MS)
    const retry = await priceChangeService.processDueProposals(SCHEDULER_AUTH)
    expect(retry.proposalEmailsSent).toBe(1)
    ;[proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal?.proposalEmail.sentAt).toBe(clock.nowIso())

    // Reminder fails twice; the final period starts only from the successful reminder.
    clock.advance(24 * HOUR_MS)
    setEmailFailureMode({ kind: 'fail-next', remaining: 2 })
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).failures).toBe(1)
    clock.advance(10 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).failures).toBe(1)
    clock.advance(10 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).remindersSent).toBe(1)
    const reminderSentAt = clock.nowIso()
    clock.advance(23 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).expired).toBe(0)
    ;[proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal && priceChangeService.getDeadlines(proposal).expiresAt).toBe(new Date(new Date(reminderSentAt).getTime() + 24 * HOUR_MS).toISOString())
  })

  it('acceptance and expiry are competing atomic transitions: exactly one wins', async () => {
    const order = await placeTestOrder()
    await propose(order, 469990)
    const [proposal] = await getProposalsForOrder(order.reference, ADMIN)
    if (!proposal) throw new Error('missing proposal')
    const [decision, expiry] = await Promise.all([
      priceChangeService.decide({ token: lastToken(), decision: 'accept' }),
      resolveProposal({ proposalId: proposal.id, outcome: 'expired', at: clock.nowIso(), orderPatch: { priceApprovalStatus: 'expired', fulfillmentStatus: 'cancelled' } }, SCHEDULER_AUTH),
    ])
    const accepted = decision.outcome === 'accepted'
    expect(accepted).not.toBe(expiry.won)
    const latest = await reload(order)
    expect(latest.priceApprovalStatus).toBe(accepted ? 'accepted' : 'expired')
  })

  it('a decision after the final deadline loses even before the scheduler runs', async () => {
    const order = await placeTestOrder()
    await propose(order, 469990)
    const token = lastToken()
    clock.advance(24 * HOUR_MS)
    await priceChangeService.processDueProposals(SCHEDULER_AUTH)
    clock.advance(24 * HOUR_MS)
    expect(await priceChangeService.decide({ token, decision: 'accept' })).toEqual({ outcome: 'already_resolved', status: 'expired' })
    expect((await reload(order)).cancellation?.reason).toBe('price_change_timeout')
  })

  it('handles replayed, superseded, expired and invalid tokens safely', async () => {
    const order = await placeTestOrder()
    await propose(order, 469990)
    const firstToken = lastToken()
    await expect(propose(order, 479990)).rejects.toThrow(/aktív ajánlat/)
    await propose(order, 479990, true)
    const secondToken = lastToken()
    expect(await priceChangeService.decide({ token: firstToken, decision: 'accept' })).toEqual({ outcome: 'already_resolved', status: 'superseded' })
    expect((await priceChangeService.getDecisionView(firstToken)).state).toBe('superseded')
    expect(await priceChangeService.decide({ token: secondToken, decision: 'accept' })).toEqual({ outcome: 'accepted' })
    expect(await priceChangeService.decide({ token: secondToken, decision: 'reject' })).toEqual({ outcome: 'already_resolved', status: 'accepted' })
    expect((await reload(order)).fulfillmentStatus).toBe('received')
    expect(await priceChangeService.decide({ token: 'x'.repeat(43), decision: 'accept' })).toEqual({ outcome: 'invalid' })
    expect((await priceChangeService.getDecisionView('rovid')).state).toBe('invalid')
    const proposals = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposals.map((proposal) => proposal.status).sort()).toEqual(['accepted', 'superseded'])
    expect(JSON.stringify(proposals)).not.toContain(secondToken)
  })

  it('reading the decision page (GET) never mutates state', async () => {
    const order = await placeTestOrder()
    await propose(order, 469990)
    const token = lastToken()
    clock.advance(60 * HOUR_MS)
    const before = JSON.stringify({ orders: sampleStore().orders, proposals: sampleStore().proposals })
    const view = await priceChangeService.getDecisionView(token)
    expect(view.state).toBe('pending')
    expect(JSON.stringify({ orders: sampleStore().orders, proposals: sampleStore().proposals })).toBe(before)
  })

  it('never logs decision tokens, links or addresses', async () => {
    const order = await placeTestOrder()
    await propose(order, 469990)
    const token = lastToken()
    const logged = JSON.stringify(infoSpy.mock.calls)
    expect(logged).toContain('SZIMULÁLT')
    expect(logged).not.toContain(token)
    expect(logged).not.toContain('/arvaltozas/')
    expect(logged).not.toContain('Teszt utca')
    const entries = await getEmailLogEntries(ADMIN)
    expect(entries.every((entry) => entry.preview === null)).toBe(true)
  })
})
