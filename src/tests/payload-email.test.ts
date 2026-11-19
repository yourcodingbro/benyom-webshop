import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { enableResendMode, resetWorld, TEST_SENDER, testPayload } from '@/tests/helpers'
import { acceptAll, failNext, send } from '@/tests/resend-mock'

vi.mock('resend', async (importOriginal) => (await import('@/tests/resend-mock')).mockResendModule(await importOriginal()))

const ADMIN_EMAIL = 'admin@teszt.hu'
const logged: string[] = []

beforeEach(async () => {
  await resetWorld()
  acceptAll()
  logged.length = 0
  const capture = (...args: unknown[]): void => void logged.push(JSON.stringify(args))
  for (const level of ['info', 'warn', 'error', 'log'] as const) vi.spyOn(console, level).mockImplementation(capture)
})
afterEach(() => vi.restoreAllMocks())

async function nativeJobs() {
  const payload = await testPayload()
  return (await payload.find({ collection: 'email-messages', where: { templateId: { equals: 'payload-native' } }, overrideAccess: true })).docs
}

describe('Payload native email adapter (via emailService)', () => {
  it('is configured on Payload (no console fallback)', async () => {
    const payload = await testPayload()
    expect(payload.email.name).toBe('benyom-email-service')
  })

  it('log mode: the forgot-password email is recorded as simulated, the reset token never stored or logged', async () => {
    const payload = await testPayload()
    const before = send.mock.calls.length
    const token = await payload.forgotPassword({ collection: 'users', data: { email: ADMIN_EMAIL } })
    expect(typeof token).toBe('string')
    expect(send.mock.calls.length).toBe(before)
    const jobs = await nativeJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ status: 'simulated', to: ADMIN_EMAIL, category: 'admin' })
    const stored = JSON.stringify(jobs[0])
    expect(stored).not.toContain(String(token))
    expect(logged.join(' ')).not.toContain(String(token))
  })

  it('resend mode: delivers exactly once with Payload\'s subject and link, the store-settings sender, and a redacted history', async () => {
    await enableResendMode()
    const payload = await testPayload()
    const before = send.mock.calls.length
    const token = String(await payload.forgotPassword({ collection: 'users', data: { email: ADMIN_EMAIL } }))
    expect(send.mock.calls.length - before).toBe(1)
    const sent = send.mock.calls.at(-1)?.[0] as { from: string; to: string; subject: string; html: string; text: string }
    expect(sent).toMatchObject({ from: TEST_SENDER, to: ADMIN_EMAIL })
    expect(sent.subject.length).toBeGreaterThan(0)
    // The recipient gets the real link; only the stored copy and logs are redacted.
    expect(sent.html).toContain(token)
    expect(sent.text).toContain(token)
    const jobs = await nativeJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ status: 'submitted', subject: sent.subject })
    expect(JSON.stringify(jobs[0])).not.toContain(token)
    expect(logged.join(' ')).not.toContain(token)
    expect(logged.join(' ')).not.toContain('re_test_')
  })

  it('sends nothing for an unknown address, and a failed delivery is recorded without telling the visitor', async () => {
    await enableResendMode()
    const payload = await testPayload()
    const before = send.mock.calls.length
    await payload.forgotPassword({ collection: 'users', data: { email: 'nincs-ilyen@example.com' } })
    expect(send.mock.calls.length).toBe(before)
    expect(await nativeJobs()).toHaveLength(0)

    failNext(1)
    // No throw: an error here would reveal that the account exists.
    await expect(payload.forgotPassword({ collection: 'users', data: { email: ADMIN_EMAIL } })).resolves.toBeTruthy()
    const jobs = await nativeJobs()
    expect(jobs).toHaveLength(1)
    // One-shot: never retried from storage.
    expect(jobs[0]).toMatchObject({ status: 'failed', nextAttemptAt: null })
  })
})
