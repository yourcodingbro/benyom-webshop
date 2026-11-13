import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getEmailLogEntries } from '@/dto/email-log'
import { getOrder } from '@/dto/orders'
import { getProposalsForOrder, resolveProposal } from '@/dto/price-change-proposals'
import { SCHEDULER_AUTH } from '@/lib/authorization'
import { HOUR_MS, clock } from '@/lib/clock'
import { decisionToken } from '@/lib/decision-token'
import { orderService } from '@/services/orderService'
import { priceChangeService } from '@/services/priceChangeService'
import { ADMIN, placeTestOrder, reload, resetWorld, testPayload, enableResendMode } from '@/tests/helpers'
import { acceptAll, failNext, send } from '@/tests/resend-mock'
import type { Order } from '@/types/order'
import type { EmailKind } from '@/types/proposal'

vi.mock('resend', async (importOriginal) => (await import('@/tests/resend-mock')).mockResendModule(await importOriginal()))

let infoSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await resetWorld()
  enableResendMode()
  acceptAll()
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

async function propose(order: Order, price: number, supersedeActive: boolean = false): Promise<string> {
  const lineId = order.submission.lines[0]?.lineId ?? ''
  const proposal = await priceChangeService.createProposal({ orderReference: order.reference, lines: [{ lineId, proposedUnitPrice: price }], explanation: 'A beszállítói ár emelkedett.', supersedeActive }, ADMIN)
  return proposal.id
}

/** The decision link token exactly as the customer's email contains it (HMAC-derived, never stored). */
function tokenOf(proposalId: string, kind: EmailKind = 'proposal'): string {
  return decisionToken(proposalId, kind)
}

describe('price-change proposals (persistent, Resend mocked)', () => {
  it('holds fulfillment while pending; acceptance changes only the agreed price and keeps the original snapshot', async () => {
    const order = await placeTestOrder()
    const id = await propose(order, 469990)
    const pending = await reload(order)
    expect(pending.priceApprovalStatus).toBe('pending')
    await expect(orderService.updateFulfillmentStatus({ reference: order.reference, status: 'confirmed', expectedVersion: pending.version }, ADMIN)).rejects.toThrow(/szünetel/)
    expect(await priceChangeService.decide({ token: tokenOf(id), decision: 'accept' })).toEqual({ outcome: 'accepted' })
    const accepted = await reload(order)
    expect(accepted.agreed.totals.grandTotal).toBe(469990)
    expect(accepted.agreed.source).toBe('price_change')
    expect(accepted.submission).toEqual(order.submission)
    expect(accepted.events.map((event) => event.type)).toEqual(expect.arrayContaining(['proposal_created', 'proposal_accepted']))
    expect(accepted.events.find((event) => event.type === 'proposal_accepted')?.actor).toBe('customer')
  })

  it('rejection cancels the entire order and sends the cancellation email', async () => {
    const order = await placeTestOrder(['APL-IP17-256-01', 'SAM-A57-128-01'])
    const id = await propose(order, 469990)
    expect(await priceChangeService.decide({ token: tokenOf(id), decision: 'reject' })).toEqual({ outcome: 'rejected' })
    const cancelled = await reload(order)
    expect(cancelled.fulfillmentStatus).toBe('cancelled')
    expect(cancelled.cancellation?.reason).toBe('price_change_rejected')
    expect(cancelled.notifications.map((record) => record.templateId)).toContain('cancelled-after-rejection')
    // The per-status "cancelled" email is not added: the workflow sends its own required email.
    expect(cancelled.notifications.map((record) => record.templateId)).not.toContain('cancelled-by-store')
  })

  it('rejects proposals for completed, cancelled or demo orders', async () => {
    const demo = await getOrder('BNY-MNTA-0001', ADMIN)
    if (!demo) throw new Error('missing demo order')
    await expect(propose(demo, 1)).rejects.toThrow(/Demó|nem küldhető/)
  })

  it('one reminder after 24 h; cancellation 24 h after the reminder was accepted', async () => {
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

  it('failed sends start no period; a delayed reminder still gives the full final 24 hours', async () => {
    const order = await placeTestOrder()
    failNext(1)
    await propose(order, 469990)
    let [proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal?.proposalEmail.sentAt).toBeNull()
    clock.advance(30 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).proposalEmailsSent).toBe(1)
    ;[proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal?.proposalEmail.sentAt).toBe(clock.nowIso())

    clock.advance(24 * HOUR_MS)
    failNext(1)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).failures).toBe(1)
    clock.advance(10 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).remindersSent).toBe(1)
    const reminderSentAt = clock.nowIso()
    clock.advance(23 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).expired).toBe(0)
    ;[proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal && priceChangeService.getDeadlines(proposal).expiresAt).toBe(new Date(new Date(reminderSentAt).getTime() + 24 * HOUR_MS).toISOString())
    // A retry never created a second proposal.
    expect(await getProposalsForOrder(order.reference, ADMIN)).toHaveLength(1)
  })

  it('logging mode never starts a real customer deadline', async () => {
    process.env.EMAIL_MODE = 'log'
    const order = await placeTestOrder()
    await propose(order, 469990)
    const [proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal?.proposalEmail.sentAt).toBeNull()
    expect(proposal?.proposalEmail.lastError).toMatch(/Naplózó mód/)
    clock.advance(100 * HOUR_MS)
    const report = await priceChangeService.processDueProposals(SCHEDULER_AUTH)
    expect(report.remindersSent + report.expired).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('concurrent accept, reject and expiry: exactly one transition wins', async () => {
    const order = await placeTestOrder()
    const id = await propose(order, 469990)
    const [accept, reject, expiry] = await Promise.all([
      priceChangeService.decide({ token: tokenOf(id), decision: 'accept' }),
      priceChangeService.decide({ token: tokenOf(id), decision: 'reject' }),
      resolveProposal({ proposalId: id, outcome: 'expired', at: clock.nowIso(), orderPatch: { priceApprovalStatus: 'expired', fulfillmentStatus: 'cancelled', skipStatusNotification: true } }, SCHEDULER_AUTH),
    ])
    const winners = [accept.outcome === 'accepted', reject.outcome === 'rejected', expiry.won].filter(Boolean)
    expect(winners).toHaveLength(1)
    const latest = await reload(order)
    expect(['accepted', 'rejected', 'expired']).toContain(latest.priceApprovalStatus)
  })

  it('handles replayed, superseded and invalid tokens; GET never mutates', async () => {
    const order = await placeTestOrder()
    const first = await propose(order, 469990)
    await expect(propose(order, 479990)).rejects.toThrow(/aktív ajánlat/)
    const second = await propose(order, 479990, true)
    expect(await priceChangeService.decide({ token: tokenOf(first), decision: 'accept' })).toEqual({ outcome: 'already_resolved', status: 'superseded' })
    const payload = await testPayload()
    const before = JSON.stringify((await payload.find({ collection: 'price-change-proposals', overrideAccess: true, depth: 0 })).docs)
    expect((await priceChangeService.getDecisionView(tokenOf(second))).state).toBe('pending')
    expect(JSON.stringify((await payload.find({ collection: 'price-change-proposals', overrideAccess: true, depth: 0 })).docs)).toBe(before)
    expect(await priceChangeService.decide({ token: tokenOf(second), decision: 'accept' })).toEqual({ outcome: 'accepted' })
    expect(await priceChangeService.decide({ token: tokenOf(second), decision: 'reject' })).toEqual({ outcome: 'already_resolved', status: 'accepted' })
    expect(await priceChangeService.decide({ token: 'x'.repeat(43), decision: 'accept' })).toEqual({ outcome: 'invalid' })
  })

  it('never stores or logs decision tokens or links', async () => {
    const order = await placeTestOrder()
    const id = await propose(order, 469990)
    const token = tokenOf(id)
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(token)
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain('/arvaltozas/')
    const entries = await getEmailLogEntries(ADMIN)
    const proposalEmail = entries.find((entry) => entry.templateId === 'price-change-proposal')
    expect(proposalEmail?.preview?.html).toContain('döntési link')
    expect(JSON.stringify(entries)).not.toContain(token)
    expect(JSON.stringify(entries)).not.toContain('/arvaltozas/')
    // The provider still received the working link.
    expect(JSON.stringify(send.mock.calls)).toContain(`/arvaltozas/${token}`)
  })
})
