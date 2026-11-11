import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getStoreRecipient } from '@/config/email'
import { getOrder } from '@/dto/orders'
import { getProposalsForOrder } from '@/dto/price-change-proposals'
import { getStoreSettings } from '@/dto/settings'
import { HOUR_MS, clock } from '@/lib/clock'
import { SCHEDULER_AUTH } from '@/lib/authorization'
import { emailService } from '@/services/emailService'
import { priceChangeService } from '@/services/priceChangeService'
import { ADMIN, placeTestOrder, resetWorld } from '@/tests/helpers'
import type { SendEmailInput } from '@/types/email'

// Resend SDK mock: no network, no real email. Each test decides what the provider returns.
const send = vi.fn()
const constructed: string[] = []
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
    constructor(apiKey: string) {
      constructed.push(apiKey)
    }
  },
}))

const API_KEY = 're_test_0123456789abcdefghijklmnopqrstuv'
const ENV_NAMES = ['EMAIL_MODE', 'RESEND_API_KEY', 'EMAIL_FROM', 'CONTACT_EMAIL'] as const

function setEnv(values: Partial<Record<(typeof ENV_NAMES)[number], string>>): void {
  for (const name of ENV_NAMES) {
    if (values[name] === undefined) delete process.env[name]
    else process.env[name] = values[name]
  }
}

const RESEND_ENV = { EMAIL_MODE: 'resend', RESEND_API_KEY: API_KEY, EMAIL_FROM: 'Webshop <rendeles@example.com>', CONTACT_EMAIL: 'bolt@example.com' }

async function contactInput(): Promise<SendEmailInput> {
  return {
    to: 'bolt@example.com',
    replyTo: 'latogato@example.com',
    template: { id: 'contact-message', message: { id: 'm1', submissionKey: 'k1', name: 'Teszt Elek', email: 'latogato@example.com', subject: 'Kérdés', message: 'Mikor érkezik a termék?', privacyVersion: 'v1', receivedAt: clock.nowIso(), notificationStatus: 'pending' } },
    settings: await getStoreSettings(),
    orderReference: null,
    proposalId: null,
    idempotencyKey: 'contact-message/k1',
  }
}

let infoSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetWorld()
  send.mockReset()
  constructed.length = 0
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  setEnv({})
  vi.restoreAllMocks()
})

describe('email configuration', () => {
  it('defaults to log mode without contacting Resend', async () => {
    setEnv({})
    const result = await emailService.sendEmail(await contactInput())
    expect(result.status).toBe('sent_simulated')
    expect(send).not.toHaveBeenCalled()
    expect(constructed).toEqual([])
  })

  it('fails loudly (never simulated) when resend mode is misconfigured', async () => {
    for (const env of [
      { EMAIL_MODE: 'resend' },
      { ...RESEND_ENV, RESEND_API_KEY: 'nem-kulcs' },
      { ...RESEND_ENV, EMAIL_FROM: 'nem cím' },
      { ...RESEND_ENV, CONTACT_EMAIL: '' },
      { EMAIL_MODE: 'smtp' },
    ]) {
      setEnv(env)
      const result = await emailService.sendEmail(await contactInput())
      expect(result.status).toBe('failed')
      if (result.status === 'failed') expect(result.error).toMatch(/Hibás e-mail-beállítás/)
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('uses CONTACT_EMAIL for store notifications, falling back to settings only in log mode', async () => {
    const settings = await getStoreSettings()
    setEnv({})
    expect(getStoreRecipient(settings, 'contact')).toBe(settings.contactRecipientEmail)
    setEnv(RESEND_ENV)
    expect(getStoreRecipient(settings, 'orders')).toBe('bolt@example.com')
  })
})

describe('Resend delivery', () => {
  it('sends HTML and text from the configured sender with reply-to and a stable idempotency key', async () => {
    setEnv(RESEND_ENV)
    send.mockResolvedValue({ data: { id: 'resend-email-123' }, error: null, headers: null })
    const result = await emailService.sendEmail(await contactInput())
    expect(result).toMatchObject({ status: 'sent', messageId: 'resend-email-123' })
    expect(send).toHaveBeenCalledTimes(1)
    const [payload, options] = send.mock.calls[0] ?? []
    expect(payload).toMatchObject({ from: 'Webshop <rendeles@example.com>', to: 'bolt@example.com', replyTo: 'latogato@example.com' })
    expect(payload.html).toMatch(/^<!DOCTYPE html/i)
    expect(payload.text).toContain('Mikor érkezik a termék?')
    expect(options).toEqual({ idempotencyKey: 'contact-message/k1' })
    expect(constructed).toEqual([API_KEY])
  })

  it('maps provider errors and exceptions to the failed contract without leaking the API key', async () => {
    setEnv(RESEND_ENV)
    send.mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'Invalid `to` field', statusCode: 422 }, headers: null })
    const rejected = await emailService.sendEmail(await contactInput())
    expect(rejected.status).toBe('failed')
    if (rejected.status === 'failed') expect(rejected.error).toMatch(/validation_error.*422/)

    send.mockRejectedValueOnce(new Error('network down'))
    const thrown = await emailService.sendEmail(await contactInput())
    expect(thrown.status).toBe('failed')

    const logged = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls])
    expect(logged).not.toContain(API_KEY)
    expect(logged).not.toContain('latogato@example.com')
  })

  it('keeps the order when Resend fails and starts the proposal period only after provider acceptance', async () => {
    setEnv(RESEND_ENV)
    send.mockResolvedValue({ data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 }, headers: null })
    const order = await placeTestOrder()
    expect(await getOrder(order.reference, ADMIN)).not.toBeNull()
    expect(order.notifications.every((record) => record.status === 'failed')).toBe(true)

    const lineId = order.submission.lines[0]?.lineId ?? ''
    await priceChangeService.createProposal({ orderReference: order.reference, lines: [{ lineId, proposedUnitPrice: 469990 }], explanation: 'A beszállítói ár emelkedett.', supersedeActive: false }, ADMIN)
    let [proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal?.proposalEmail.sentAt).toBeNull()
    expect(proposal?.tokenHashes).toEqual([])

    // Retry later with the provider accepting: same idempotency key and identical content.
    send.mockResolvedValue({ data: { id: 'resend-proposal-1' }, error: null, headers: null })
    const firstPayload = send.mock.calls.at(-1)?.[0]
    clock.advance(2 * HOUR_MS)
    await priceChangeService.processDueProposals(SCHEDULER_AUTH)
    ;[proposal] = await getProposalsForOrder(order.reference, ADMIN)
    expect(proposal?.proposalEmail.sentAt).toBe(clock.nowIso())
    expect(proposal?.tokenHashes).toHaveLength(1)
    const [retryPayload, retryOptions] = send.mock.calls.at(-1) ?? []
    expect(retryOptions).toEqual({ idempotencyKey: `price-change-proposal/${order.reference}/${proposal?.id}` })
    expect(retryPayload.html).toBe(firstPayload.html)
    expect(retryPayload.text).toBe(firstPayload.text)
  })
})
