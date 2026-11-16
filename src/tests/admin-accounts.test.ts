import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HOUR_MS, clock } from '@/lib/clock'
import type { User } from '@/payload-types'
import { adminAccountService } from '@/services/adminAccountService'
import { emailService } from '@/services/emailService'
import { ADMIN, enableResendMode, resetWorld, testPayload } from '@/tests/helpers'
import { acceptAll, send } from '@/tests/resend-mock'

vi.mock('resend', async (importOriginal) => (await import('@/tests/resend-mock')).mockResendModule(await importOriginal()))

let logged: string

beforeEach(async () => {
  await resetWorld()
  enableResendMode()
  acceptAll()
  logged = ''
  const capture = (...args: unknown[]): void => {
    logged += JSON.stringify(args)
  }
  vi.spyOn(console, 'info').mockImplementation(capture)
  vi.spyOn(console, 'error').mockImplementation(capture)
})

/** The temporary password exactly as the new admin receives it (from the mocked Resend request). */
function deliveredPassword(): string {
  const request = send.mock.calls.at(-1)?.[0] as { text?: string } | undefined
  const match = /Ideiglenes jelszó: (\S+)/.exec(request?.text ?? '')
  if (!match?.[1]) throw new Error('no password delivered')
  return match[1]
}

async function userDoc(email: string): Promise<User & { collection: 'users' }> {
  const payload = await testPayload()
  const doc = (await payload.find({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true, showHiddenFields: true })).docs[0]
  if (!doc) throw new Error('user missing')
  return { ...doc, collection: 'users' }
}

async function login(email: string, password: string): Promise<boolean> {
  const payload = await testPayload()
  try {
    await payload.login({ collection: 'users', data: { email, password } })
    return true
  } catch {
    return false
  }
}

describe('admin invitation with a temporary password', () => {
  it('creates the admin with a generated, hashed temporary password and never stores or logs it', async () => {
    const result = await adminAccountService.inviteAdmin({ email: 'Uj.Admin@Example.com' }, ADMIN)
    expect(result).toMatchObject({ email: 'uj.admin@example.com', delivery: 'sent', error: null })
    const password = deliveredPassword()
    expect(password).toHaveLength(20)
    const doc = await userDoc('uj.admin@example.com')
    expect(doc).toMatchObject({ mustChangePassword: true, roles: ['admin'] })
    expect(doc.temporaryPasswordExpiresAt).toBe(new Date(clock.now().getTime() + 72 * HOUR_MS).toISOString())
    expect(await login('uj.admin@example.com', password)).toBe(true)

    const payload = await testPayload()
    const everything = JSON.stringify([
      (await payload.find({ collection: 'users', overrideAccess: true, showHiddenFields: true })).docs,
      (await payload.find({ collection: 'email-messages', overrideAccess: true })).docs,
    ])
    expect(everything).not.toContain(password)
    expect(everything).toContain('ideiglenes jelszó – a naplóból eltávolítva')
    expect(logged).not.toContain(password)
  })

  it('reports a failed delivery honestly, blocks a plain retry and lets an admin regenerate', async () => {
    send.mockImplementationOnce(async () => ({ data: null, error: { name: 'application_error', message: 'Átmeneti hiba', statusCode: 500 } }))
    const failed = await adminAccountService.inviteAdmin({ email: 'hiba@example.com' }, ADMIN)
    expect(failed.delivery).toBe('failed')
    const payload = await testPayload()
    const job = (await payload.find({ collection: 'email-messages', where: { templateId: { equals: 'admin-invitation' } }, overrideAccess: true })).docs[0]
    expect(job).toMatchObject({ status: 'failed', category: 'admin', nextAttemptAt: null })
    await expect(emailService.retry(job?.id ?? 0, ADMIN)).rejects.toThrow(/Új ideiglenes jelszó/)
    expect((await emailService.processDue(10)).processed).toBe(0)

    const regenerated = await adminAccountService.regenerateTemporaryPassword(failed.userId, ADMIN)
    expect(regenerated.delivery).toBe('sent')
    expect(await login('hiba@example.com', deliveredPassword())).toBe(true)
  })

  it('regeneration invalidates the previous temporary password and sessions; refused for activated users and self', async () => {
    const invited = await adminAccountService.inviteAdmin({ email: 'csere@example.com' }, ADMIN)
    const first = deliveredPassword()
    expect(await login('csere@example.com', first)).toBe(true)
    expect((await userDoc('csere@example.com')).sessions?.length).toBeGreaterThan(0)
    await adminAccountService.regenerateTemporaryPassword(invited.userId, ADMIN)
    const second = deliveredPassword()
    expect(second).not.toBe(first)
    expect((await userDoc('csere@example.com')).sessions ?? []).toHaveLength(0)
    expect(await login('csere@example.com', first)).toBe(false)
    expect(await login('csere@example.com', second)).toBe(true)
    await expect(adminAccountService.regenerateTemporaryPassword(invited.userId, { kind: 'admin', adminId: invited.userId })).rejects.toThrow(/Saját magának/)
    await expect(adminAccountService.regenerateTemporaryPassword(invited.userId, { kind: 'anonymous' })).rejects.toThrow()
  })
})

describe('first-login enforcement', () => {
  it('refuses every protected operation to an admin who must change the temporary password', async () => {
    await adminAccountService.inviteAdmin({ email: 'korlat@example.com' }, ADMIN)
    const user = await userDoc('korlat@example.com')
    const payload = await testPayload()
    for (const collection of ['orders', 'order-events', 'price-change-proposals', 'email-messages', 'import-jobs', 'contact-messages'] as const) {
      await expect(payload.find({ collection, user, overrideAccess: false })).rejects.toThrow()
    }
    // Products are public, but like any visitor the user sees no drafts and cannot write.
    const products = await payload.find({ collection: 'products', user, overrideAccess: false, draft: true, pagination: false })
    expect(products.docs.every((product) => product._status === 'published')).toBe(true)
    await expect(payload.update({ collection: 'products', id: 'prod-iphone-17', data: { featured: false }, user, overrideAccess: false })).rejects.toThrow()
    await expect(payload.findGlobal({ slug: 'notification-settings', user, overrideAccess: false })).rejects.toThrow()
    // Only themself is visible ("me"), and they cannot edit their account or flags directly.
    const visible = await payload.find({ collection: 'users', user, overrideAccess: false })
    expect(visible.docs.map((doc) => doc.email)).toEqual(['korlat@example.com'])
    await expect(payload.update({ collection: 'users', id: user.id, data: { password: 'Uj-Jelszo-12345' }, user, overrideAccess: false })).rejects.toThrow()
    // Admins cannot create users through the API: invitations only.
    const admin = await userDoc('admin@teszt.hu')
    await expect(payload.create({ collection: 'users', data: { email: 'kozvetlen@example.com', password: 'Kozvetlen-12345', roles: ['admin'] }, user: admin, overrideAccess: false })).rejects.toThrow()
  })

  it('validates the new password, rejects reuse, then clears the flag, the fingerprint and all sessions', async () => {
    await adminAccountService.inviteAdmin({ email: 'valtas@example.com' }, ADMIN)
    const temporary = deliveredPassword()
    expect(await login('valtas@example.com', temporary)).toBe(true)
    const { id } = await userDoc('valtas@example.com')
    const attempt = (password: string, confirmPassword: string = password): Promise<void> => adminAccountService.changeTemporaryPassword(String(id), { password, confirmPassword })

    await expect(attempt('rovid')).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { password: expect.stringMatching(/Legalább 12/) } })
    await expect(attempt('csakkisbetukbol')).rejects.toMatchObject({ fieldErrors: { password: expect.stringMatching(/háromféle/) } })
    await expect(attempt('Jo-Jelszo-2026!', 'Mas-Jelszo-2026!')).rejects.toMatchObject({ fieldErrors: { confirmPassword: 'A két jelszó nem egyezik.' } })
    await expect(attempt(temporary)).rejects.toMatchObject({ fieldErrors: { password: expect.stringMatching(/ideiglenes jelszóval/) } })

    await attempt('Jo-Jelszo-2026!')
    const after = await userDoc('valtas@example.com')
    expect(after).toMatchObject({ mustChangePassword: false, temporaryPasswordExpiresAt: null, temporaryPasswordFingerprint: null })
    expect(after.sessions ?? []).toHaveLength(0)
    expect(await login('valtas@example.com', temporary)).toBe(false)
    expect(await login('valtas@example.com', 'Jo-Jelszo-2026!')).toBe(true)
    await expect(attempt('Masik-Jelszo-2026!')).rejects.toMatchObject({ code: 'INVALID_STATE' })
    // Fully activated: normal admin access works.
    const payload = await testPayload()
    await expect(payload.find({ collection: 'orders', user: await userDoc('valtas@example.com'), overrideAccess: false })).resolves.toBeTruthy()
  })

  it('an expired temporary password cannot sign in or be changed', async () => {
    await adminAccountService.inviteAdmin({ email: 'lejart@example.com' }, ADMIN)
    const temporary = deliveredPassword()
    const { id } = await userDoc('lejart@example.com')
    clock.advance(72 * HOUR_MS)
    expect(await login('lejart@example.com', temporary)).toBe(false)
    await expect(adminAccountService.changeTemporaryPassword(String(id), { password: 'Jo-Jelszo-2026!', confirmPassword: 'Jo-Jelszo-2026!' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
