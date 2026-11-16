import { sql } from '@payloadcms/db-postgres'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UNSET_STORE_RECIPIENT } from '@/config/email'
import { addContactMessage } from '@/dto/contact-messages'
import { getStoreSettings } from '@/dto/settings'
import { clock } from '@/lib/clock'
import { importEmailSettingsFromEnv } from '@/migrations/20261116_205853_email_settings_in_store'
import { emailService } from '@/services/emailService'
import { enableResendMode, placeTestOrder, resetWorld, setEmailSettings, TEST_SENDER, TEST_STORE_EMAIL, testPayload } from '@/tests/helpers'
import { acceptAll, send } from '@/tests/resend-mock'

vi.mock('resend', async (importOriginal) => (await import('@/tests/resend-mock')).mockResendModule(await importOriginal()))

beforeEach(async () => {
  await resetWorld()
  acceptAll()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

async function jobs(where: Record<string, unknown>): Promise<{ to: string; from?: string | null; status: string; lastError?: string | null; nextAttemptAt?: string | null; replyTo?: string | null; id: number }[]> {
  const payload = await testPayload()
  return (await payload.find({ collection: 'email-messages', where: where as never, overrideAccess: true, sort: 'id' })).docs
}

const lastRequest = (): { from?: string; to?: unknown; replyTo?: unknown } => (send.mock.calls.at(-1)?.[0] as { from?: string; to?: unknown; replyTo?: unknown } | undefined) ?? {}

async function sendContact(key: string): Promise<void> {
  const { message } = await addContactMessage({ submissionKey: key, name: 'Látogató', email: 'latogato@example.com', subject: 'Kérdés', message: 'Mikor érkezik?', privacyVersion: 'v1', receivedAt: clock.nowIso() })
  const settings = await getStoreSettings()
  await emailService.sendEmail({ to: settings.contactEmail ?? UNSET_STORE_RECIPIENT, replyTo: message.email, template: { id: 'contact-message', message }, settings, orderReference: null, proposalId: null, idempotencyKey: `contact-message/${key}` })
}

describe('sender and store recipient from the store settings', () => {
  it('uses the configured sender, keeps the visitor as reply-to, and applies a change at once without rewriting history', async () => {
    await enableResendMode()
    await sendContact('k-1')
    expect(lastRequest()).toMatchObject({ from: TEST_SENDER, to: TEST_STORE_EMAIL, replyTo: 'latogato@example.com' })

    await setEmailSettings({ emailFrom: 'Új Bolt <uj@example.com>' })
    await sendContact('k-2')
    expect(lastRequest().from).toBe('Új Bolt <uj@example.com>')
    // The earlier email keeps the sender and recipient it was actually sent with.
    const [first, second] = await jobs({ category: { equals: 'contact' } })
    expect(first).toMatchObject({ from: TEST_SENDER, to: TEST_STORE_EMAIL, replyTo: 'latogato@example.com' })
    expect(second?.from).toBe('Új Bolt <uj@example.com>')
  })

  it('reports a missing sender as an actionable failure, never as simulated success', async () => {
    await enableResendMode()
    await setEmailSettings({ emailFrom: null })
    await sendContact('k-nincs-felado')
    const [job] = await jobs({ category: { equals: 'contact' } })
    // Retried with backoff (the admin can fix the setting), but never shown as sent or simulated.
    expect(job?.status).toBe('queued')
    expect(job?.lastError).toMatch(/Áruház beállításai → Feladó/)
    expect(send).not.toHaveBeenCalled()
  })

  it('queues store notifications without a recipient as a clear failure and delivers them once the address is set', async () => {
    await enableResendMode()
    await setEmailSettings({ contactEmail: null })
    const order = await placeTestOrder()
    const [storeJob] = await jobs({ and: [{ category: { equals: 'store' } }, { orderReference: { equals: order.reference } }] })
    expect(storeJob?.to).toBe(UNSET_STORE_RECIPIENT)
    expect(storeJob?.status).toBe('queued')
    expect(storeJob?.lastError).toMatch(/Kapcsolati e-mail/)
    expect(send.mock.calls.some((call) => (call[0] as { to?: unknown }).to === UNSET_STORE_RECIPIENT)).toBe(false)

    await setEmailSettings({ contactEmail: TEST_STORE_EMAIL })
    clock.advance(60_000)
    await emailService.processDue(10)
    const [after] = await jobs({ id: { equals: storeJob?.id } })
    expect(after).toMatchObject({ to: TEST_STORE_EMAIL, status: 'submitted' })
  })

  it('validates both fields with Hungarian messages and hides them from the public settings read', async () => {
    const payload = await testPayload()
    await expect(payload.updateGlobal({ slug: 'store-settings', data: { emailFrom: 'Webshop rendeles@example' }, overrideAccess: true })).rejects.toMatchObject({
      data: { errors: [expect.objectContaining({ path: 'emailFrom', message: expect.stringMatching(/Érvénytelen feladó/) })] },
    })
    await expect(payload.updateGlobal({ slug: 'store-settings', data: { storeContactEmail: 'nem-email' }, overrideAccess: true })).rejects.toThrow()
    await setEmailSettings({ emailFrom: 'rendeles@example.com' })
    expect((await getStoreSettings()).emailFrom).toBe('rendeles@example.com')
    const visitor = await payload.findGlobal({ slug: 'store-settings', overrideAccess: false })
    expect(visitor).not.toHaveProperty('emailFrom')
    expect(visitor).not.toHaveProperty('storeContactEmail')
  })
})

describe('one-time import of CONTACT_EMAIL / EMAIL_FROM', () => {
  it('fills only empty settings, skips invalid values and never overwrites', async () => {
    const payload = await testPayload()
    const db = payload.db.drizzle
    await db.execute(sql`UPDATE "store_settings" SET "store_contact_email" = NULL, "email_from" = NULL`)
    expect(await importEmailSettingsFromEnv(db, { CONTACT_EMAIL: 'bolt@example.hu', EMAIL_FROM: 'Webshop <rendeles@example.hu>' })).toEqual({ contact: 'CONTACT_EMAIL', from: 'EMAIL_FROM' })
    expect(await getStoreSettings()).toMatchObject({ contactEmail: 'bolt@example.hu', emailFrom: 'Webshop <rendeles@example.hu>' })
    // Already configured: kept.
    expect(await importEmailSettingsFromEnv(db, { CONTACT_EMAIL: 'masik@example.hu', EMAIL_FROM: 'masik@example.hu' })).toEqual({ contact: 'megtartva', from: 'megtartva' })
    expect(await getStoreSettings()).toMatchObject({ contactEmail: 'bolt@example.hu', emailFrom: 'Webshop <rendeles@example.hu>' })
    // No env: the previous contact-form recipient is used; an invalid sender is skipped.
    await db.execute(sql`UPDATE "store_settings" SET "store_contact_email" = NULL, "email_from" = NULL, "contact_recipient_email" = 'regi@example.hu'`)
    expect(await importEmailSettingsFromEnv(db, { EMAIL_FROM: 'nem egy cím' })).toEqual({ contact: 'korábbi kapcsolati címzett', from: 'EMAIL_FROM érvénytelen, kihagyva' })
    expect(await getStoreSettings()).toMatchObject({ contactEmail: 'regi@example.hu', emailFrom: null })
  })
})
