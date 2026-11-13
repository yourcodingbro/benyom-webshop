import { createHmac } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getEmailConfig } from '@/config/email'
import { addContactMessage } from '@/dto/contact-messages'
import { getEmailJob } from '@/dto/email-log'
import { getStoreSettings } from '@/dto/settings'
import { clock } from '@/lib/clock'
import { emailService } from '@/services/emailService'
import { ADMIN, placeTestOrder, resetWorld, testPayload, enableResendMode } from '@/tests/helpers'
import { acceptAll, failNext, send } from '@/tests/resend-mock'
import type { SendEmailInput } from '@/types/email'

vi.mock('resend', async (importOriginal) => (await import('@/tests/resend-mock')).mockResendModule(await importOriginal()))

let infoSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await resetWorld()
  acceptAll()
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

async function contactInput(key: string): Promise<SendEmailInput> {
  const { message } = await addContactMessage({ submissionKey: key, name: 'Teszt Elek', email: 'latogato@example.com', subject: 'Kérdés', message: 'Mikor érkezik a termék?', privacyVersion: 'v1', receivedAt: clock.nowIso() })
  return { to: 'bolt@example.com', replyTo: 'latogato@example.com', template: { id: 'contact-message', message }, settings: await getStoreSettings(), orderReference: null, proposalId: null, idempotencyKey: `contact-message/${key}` }
}

async function jobId(key: string): Promise<number> {
  const payload = await testPayload()
  const doc = (await payload.find({ collection: 'email-messages', where: { idempotencyKey: { equals: key } }, overrideAccess: true })).docs[0]
  if (!doc) throw new Error('job missing')
  return doc.id
}

describe('email configuration', () => {
  it('defaults to logging mode without contacting Resend and records a simulated email', async () => {
    expect(getEmailConfig().mode).toBe('log')
    const result = await emailService.sendEmail(await contactInput('k-log'))
    expect(result.status).toBe('sent_simulated')
    expect(send).not.toHaveBeenCalled()
    expect((await getEmailJob(await jobId('contact-message/k-log')))?.status).toBe('simulated')
  })

  it('fails loudly (never simulated) when resend mode is misconfigured', async () => {
    enableResendMode()
    process.env.RESEND_API_KEY = ''
    const result = await emailService.sendEmail(await contactInput('k-bad'))
    expect(result.status).toBe('failed')
    if (result.status === 'failed') expect(result.error).toMatch(/RESEND_API_KEY/)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('durable delivery and retries', () => {
  it('persists the job, retries transient failures with backoff using the same idempotency key', async () => {
    enableResendMode()
    failNext(1)
    const first = await emailService.sendEmail(await contactInput('k-retry'))
    expect(first.status).toBe('failed')
    const id = await jobId('contact-message/k-retry')
    const queued = await getEmailJob(id)
    expect(queued).toMatchObject({ status: 'queued', attempts: 1 })
    expect(queued?.nextAttemptAt).toBe(new Date(clock.now().getTime() + 60_000).toISOString())
    expect((await emailService.processDue(10)).processed).toBe(0)
    clock.advance(60_000)
    expect(await emailService.processDue(10)).toMatchObject({ processed: 1, submitted: 1 })
    const keys = send.mock.calls.map((call: unknown[]) => (call[1] as { idempotencyKey: string }).idempotencyKey)
    expect(keys).toEqual(['contact-message/k-retry', 'contact-message/k-retry'])
    const done = await getEmailJob(id)
    expect(done).toMatchObject({ status: 'submitted', attempts: 2, providerMessageId: expect.stringMatching(/^re_msg_/) })
    // Provider acceptance is not delivery.
    expect(done?.status).not.toBe('delivered')
    // A submitted email is never sent twice.
    await emailService.sendEmail(await contactInput('k-retry'))
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('stops on permanent provider errors and lets an admin retry safely', async () => {
    enableResendMode()
    send.mockImplementationOnce(async () => ({ data: null, error: { name: 'validation_error', message: 'Érvénytelen címzett', statusCode: 422 } }))
    await emailService.sendEmail(await contactInput('k-perm'))
    const id = await jobId('contact-message/k-perm')
    expect(await getEmailJob(id)).toMatchObject({ status: 'failed', nextAttemptAt: null })
    await expect(emailService.retry(id, { kind: 'anonymous' })).rejects.toThrow()
    expect(await emailService.retry(id, ADMIN)).toBe('submitted')
    await expect(emailService.retry(id, ADMIN)).rejects.toThrow(/nem küldünk kétszer/)
  })

  it('never logs the API key, decision links or message bodies', async () => {
    enableResendMode()
    await emailService.sendEmail(await contactInput('k-log2'))
    const logged = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls])
    expect(logged).not.toContain('re_test_0123456789')
    expect(logged).not.toContain('Mikor érkezik a termék?')
  })
})

/** Svix signature as Resend sends it: v1,base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)). */
function signed(body: string, id: string): { id: string; timestamp: string; signature: string } {
  const secret = Buffer.from((process.env.RESEND_WEBHOOK_SECRET ?? '').replace(/^whsec_/, ''), 'base64')
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64')
  return { id, timestamp, signature: `v1,${signature}` }
}

describe('Resend webhooks', () => {
  async function submittedOrderEmail(): Promise<{ messageId: string; jobId: number }> {
    enableResendMode()
    const order = await placeTestOrder()
    const payload = await testPayload()
    const doc = (await payload.find({ collection: 'email-messages', where: { and: [{ orderReference: { equals: order.reference } }, { templateId: { equals: 'order-received' } }] }, overrideAccess: true })).docs[0]
    if (!doc?.providerMessageId) throw new Error('not submitted')
    return { messageId: doc.providerMessageId, jobId: doc.id }
  }

  const event = (type: string, emailId: string, createdAt: string): string => JSON.stringify({ type, created_at: createdAt, data: { email_id: emailId, created_at: createdAt } })

  it('verifies signatures, applies delivery and ignores duplicates', async () => {
    const { messageId, jobId: id } = await submittedOrderEmail()
    const body = event('email.delivered', messageId, '2026-11-11T09:05:00.000Z')
    await expect(emailService.handleWebhook(body, { ...signed(body, 'msg_1'), signature: 'v1,hamis' })).rejects.toThrow(/aláírás/)
    expect(await emailService.handleWebhook(body, signed(body, 'msg_1'))).toBe('applied')
    expect(await emailService.handleWebhook(body, signed(body, 'msg_1'))).toBe('duplicate')
    expect((await getEmailJob(id))?.status).toBe('delivered')
  })

  it('handles out-of-order events without moving an email backwards', async () => {
    const { messageId, jobId: id } = await submittedOrderEmail()
    const bounced = event('email.bounced', messageId, '2026-11-11T09:10:00.000Z')
    const delivered = event('email.delivered', messageId, '2026-11-11T09:05:00.000Z')
    expect(await emailService.handleWebhook(bounced, signed(bounced, 'msg_b'))).toBe('applied')
    expect(await emailService.handleWebhook(delivered, signed(delivered, 'msg_d'))).toBe('ignored')
    expect((await getEmailJob(id))?.status).toBe('bounced')
    const unknown = event('email.delivered', 'ismeretlen', '2026-11-11T09:05:00.000Z')
    expect(await emailService.handleWebhook(unknown, signed(unknown, 'msg_u'))).toBe('unknown_message')
  })
})

