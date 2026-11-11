import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getContactMessages } from '@/dto/contact-messages'
import { getStoreSettings } from '@/dto/settings'
import { renderEmail } from '@/emails'
import { clock } from '@/lib/clock'
import { setEmailFailureMode } from '@/lib/dev-simulation'
import { createFormToken } from '@/lib/form-token'
import { CONTACT_FORM_PURPOSE, contactService } from '@/services/contactService'
import { emailService } from '@/services/emailService'
import { ADMIN, placeTestOrder, resetWorld } from '@/tests/helpers'
import type { EmailTemplate } from '@/types/email'

beforeEach(() => {
  resetWorld()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('React Email templates', () => {
  it('render Hungarian HTML and plain text for every template', async () => {
    const order = await placeTestOrder()
    const settings = await getStoreSettings()
    const proposal = {
      id: 'prop-x', orderReference: order.reference, status: 'pending' as const, explanation: 'Teszt indoklás.', tokenHashes: [], createdAt: clock.nowIso(), createdBy: 'teszt',
      lines: [{ lineId: 'line-1', sku: 'APL-IP17-256-01', productName: 'Apple iPhone 17', quantity: 1, originalUnitPrice: 449990, proposedUnitPrice: 469990 }],
      originalTotals: order.agreed.totals, proposedTotals: { ...order.agreed.totals, itemsTotal: 469990, grandTotal: 469990 },
      proposalEmail: { attempts: 0, firstAttemptAt: null, lastAttemptAt: null, lastError: null, claimedAt: null, sentAt: null }, reminderEmail: { attempts: 0, firstAttemptAt: null, lastAttemptAt: null, lastError: null, claimedAt: null, sentAt: null },
      resolvedAt: null, supersedesId: null, supersededById: null, version: 1,
    }
    const message = { id: 'msg-1', submissionKey: 'k', name: 'Teszt Elek', email: 'teszt@example.com', subject: 'Kérdés', message: 'Mikor érkezik a termék?', privacyVersion: 'v1', receivedAt: clock.nowIso(), notificationStatus: 'pending' as const }
    const templates: EmailTemplate[] = [
      { id: 'order-received', order },
      { id: 'store-new-order', order },
      { id: 'price-change-proposal', order, proposal, decisionUrl: 'http://localhost:3000/arvaltozas/abc', earliestCancellation: clock.nowIso() },
      { id: 'price-change-reminder', order, proposal, decisionUrl: 'http://localhost:3000/arvaltozas/abc', deadline: clock.nowIso() },
      { id: 'price-change-accepted', order, proposal },
      { id: 'cancelled-after-rejection', order },
      { id: 'cancelled-after-timeout', order },
      { id: 'cancelled-by-store', order },
      { id: 'fulfillment-update', order, status: 'ready_for_collection' },
      { id: 'contact-message', message },
    ]
    for (const template of templates) {
      const rendered = await renderEmail(template, settings)
      expect(rendered.html).toMatch(/^<!DOCTYPE html/i)
      expect(rendered.html).toContain('lang="hu"')
      expect(rendered.text).not.toMatch(/<\w+/)
      expect(rendered.text).toContain('Mintaüzenet')
      expect(rendered.subject.length).toBeGreaterThan(5)
    }
    const proposalEmail = await renderEmail(templates[2] as EmailTemplate, settings)
    expect(proposalEmail.text).toContain('TELJES rendelés')
    expect(proposalEmail.html).toContain('href="http://localhost:3000/arvaltozas/abc"')
  })
})

describe('contact form service', () => {
  const valid = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: 'Teszt Elek',
    email: 'teszt@example.com',
    subject: 'Kérdés a szállításról',
    message: 'Mikor várható a megrendelt termék?',
    privacyAccepted: true,
    submissionKey: '00000000-0000-4000-8000-0000000000aa',
    formToken: createFormToken(CONTACT_FORM_PURPOSE),
    website: '',
    ...overrides,
  })

  it('validates fields with Hungarian messages and rejects instant submissions', async () => {
    const invalid = await contactService.submitContactMessage(valid({ email: 'nem-email', message: 'rövid', privacyAccepted: false }))
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.fieldErrors.email).toMatch(/e-mail/)
      expect(invalid.fieldErrors.message).toMatch(/legalább 10/)
      expect(invalid.fieldErrors.privacyAccepted).toMatch(/adatkezelési/)
    }
    const tooFast = await contactService.submitContactMessage(valid())
    expect(tooFast).toMatchObject({ ok: false, message: expect.stringMatching(/várjon/) })
    expect(await contactService.submitContactMessage(valid({ formToken: '123.hamis' }))).toMatchObject({ ok: false })
  })

  it('sends to the server-side recipient with the visitor as reply-to, once per submission key', async () => {
    const spy = vi.spyOn(emailService, 'sendEmail')
    const input = valid()
    clock.advance(5_000)
    expect(await contactService.submitContactMessage(input)).toEqual({ ok: true, delivery: 'simulated' })
    expect(await contactService.submitContactMessage(input)).toEqual({ ok: true, delivery: 'simulated' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ to: 'kapcsolat@minta-webshop.example', replyTo: 'teszt@example.com' })
    expect(await getContactMessages(ADMIN)).toHaveLength(1)
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('teszt@example.com')
  })

  it('ignores honeypot submissions and lets a failed notification be retried without duplicates', async () => {
    const spam = valid({ website: 'http://spam.example' })
    const input = valid({ submissionKey: '00000000-0000-4000-8000-0000000000bb' })
    clock.advance(5_000)
    expect(await contactService.submitContactMessage(spam)).toEqual({ ok: true, delivery: 'simulated' })
    expect(await getContactMessages(ADMIN)).toHaveLength(0)

    setEmailFailureMode({ kind: 'fail-next', remaining: 1 })
    expect((await contactService.submitContactMessage(input)).ok).toBe(false)
    expect(await contactService.submitContactMessage(input)).toEqual({ ok: true, delivery: 'simulated' })
    const stored = await getContactMessages(ADMIN)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.notificationStatus).toBe('sent_simulated')
  })
})
