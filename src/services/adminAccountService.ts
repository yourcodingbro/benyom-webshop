import 'server-only'

import { z } from 'zod'

import { getServerEnv } from '@/config/env'
import { getSiteUrl } from '@/config/runtime'
import { getEmailJobIdByKey } from '@/dto/email-log'
import { getStoreSettings } from '@/dto/settings'
import { type AdminAccount, completeTemporaryPasswordChange, createInvitedAdmin, getAdminAccount, resetTemporaryCredentials, setLastInvitationEmail, type TemporaryCredentials } from '@/dto/users'
import { assertAdminOrSystem } from '@/lib/authorization'
import { addHours, clock } from '@/lib/clock'
import { generateTemporaryPassword, hmac, randomToken, safeEqual } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { checkPasswordPolicy, isPasswordAcceptable } from '@/lib/password-policy'
import { emailService } from '@/services/emailService'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'

/** Delivery result shown to the admin; `failed` means the new admin has not received the password. */
export type InvitationResult = {
  userId: string
  email: string
  expiresAt: IsoDateTime
  delivery: 'sent' | 'simulated' | 'failed'
  error: string | null
}

type AdminAccountService = {
  /** Creates an admin with a generated temporary password and emails it (Hungarian template). */
  inviteAdmin: (input: unknown, auth: AuthorizationContext) => Promise<InvitationResult>
  /** Issues a new temporary password (the old one stops working, sessions end) and emails it. */
  regenerateTemporaryPassword: (userId: string, auth: AuthorizationContext) => Promise<InvitationResult>
  /** First-login password change by the signed-in user themself. */
  changeTemporaryPassword: (userId: string, input: unknown) => Promise<void>
}

const inviteSchema = z.object({ email: z.email({ error: 'Adjon meg érvényes e-mail-címet.' }).trim().toLowerCase().max(254) })
const changeSchema = z.object({ password: z.string().max(512), confirmPassword: z.string().max(512) })

/** Keyed hash of the temporary password, only to reject its reuse as the new password. */
function fingerprint(email: string, password: string): string {
  return hmac(`temporary-admin-password:${email.toLowerCase()}:${password}`)
}

function issueCredentials(email: string): TemporaryCredentials {
  const password = generateTemporaryPassword()
  return { password, expiresAt: addHours(clock.nowIso(), getServerEnv().ADMIN_TEMP_PASSWORD_TTL_HOURS), fingerprint: fingerprint(email, password) }
}

function actor(auth: AuthorizationContext): string {
  return auth.kind === 'admin' ? `admin:${auth.adminId}` : auth.kind
}

/**
 * Sends the temporary password once (never stored; redacted from the email history) and links the
 * email record to the user so the admin UI shows its real delivery state.
 */
async function sendInvitation(account: AdminAccount, credentials: TemporaryCredentials, auth: AuthorizationContext): Promise<InvitationResult> {
  // One key per issued password: a regenerated password is a new email, never deduplicated into the old one.
  const idempotencyKey = `admin-invitation/${account.id}/${randomToken(9)}`
  const result = await emailService.sendEmail({
    to: account.email,
    replyTo: null,
    template: { id: 'admin-invitation', email: account.email, temporaryPassword: credentials.password, loginUrl: `${getSiteUrl()}/admin/login`, expiresAt: credentials.expiresAt },
    settings: await getStoreSettings(),
    orderReference: null,
    proposalId: null,
    idempotencyKey,
    secrets: [credentials.password],
  })
  const jobId = await getEmailJobIdByKey(idempotencyKey)
  await setLastInvitationEmail(account.id, jobId, auth)
  const delivery = result.status === 'sent' ? 'sent' : result.status === 'sent_simulated' ? 'simulated' : 'failed'
  console.info('[ADMIN FIÓK]', { event: 'temporary-password-issued', userId: account.id, by: actor(auth), delivery })
  return { userId: account.id, email: account.email, expiresAt: credentials.expiresAt, delivery, error: result.status === 'failed' ? result.error : null }
}


export const adminAccountService: AdminAccountService = {
  async inviteAdmin(input: unknown, auth: AuthorizationContext): Promise<InvitationResult> {
    assertAdminOrSystem(auth)
    const parsed = inviteSchema.safeParse(input)
    if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Érvénytelen adat.', { email: parsed.error.issues[0]?.message ?? 'Érvénytelen e-mail-cím.' })
    const credentials = issueCredentials(parsed.data.email)
    const account = await createInvitedAdmin(parsed.data.email, credentials, auth)
    return sendInvitation(account, credentials, auth)
  },

  async regenerateTemporaryPassword(userId: string, auth: AuthorizationContext): Promise<InvitationResult> {
    assertAdminOrSystem(auth)
    if (auth.kind === 'admin' && auth.adminId === userId) throw new AppError('INVALID_STATE', 'Saját magának nem generálhat ideiglenes jelszót.')
    const account = await getAdminAccount(userId, auth)
    if (!account) throw new AppError('NOT_FOUND', 'A felhasználó nem található.')
    if (!account.mustChangePassword) throw new AppError('INVALID_STATE', 'Ez a felhasználó már beállította saját jelszavát; ideiglenes jelszó nem adható ki.')
    const credentials = issueCredentials(account.email)
    const updated = await resetTemporaryCredentials(userId, credentials, auth)
    return sendInvitation(updated, credentials, auth)
  },

  async changeTemporaryPassword(userId: string, input: unknown): Promise<void> {
    const system: AuthorizationContext = { kind: 'system', process: 'first-login-password-change' }
    const parsed = changeSchema.safeParse(input)
    if (!parsed.success) throw new AppError('VALIDATION', 'Adja meg az új jelszót kétszer.')
    const account = await getAdminAccount(userId, system)
    if (!account) throw new AppError('NOT_FOUND', 'A felhasználó nem található.')
    if (!account.mustChangePassword) throw new AppError('INVALID_STATE', 'A jelszó már módosítva lett. Jelentkezzen be az új jelszóval.')
    if (account.temporaryPasswordExpiresAt && account.temporaryPasswordExpiresAt <= clock.nowIso()) {
      throw new AppError('FORBIDDEN', 'Az ideiglenes jelszó lejárt. Kérjen új ideiglenes jelszót egy adminisztrátortól.')
    }
    const problems = checkPasswordPolicy({ password: parsed.data.password, confirmation: parsed.data.confirmPassword, email: account.email })
    if (!isPasswordAcceptable(problems)) {
      throw new AppError('VALIDATION', 'Az új jelszó nem felel meg a követelményeknek.', {
        ...(problems.password.length ? { password: problems.password.join(' ') } : {}),
        ...(problems.confirmation ? { confirmPassword: problems.confirmation } : {}),
      })
    }
    if (account.temporaryPasswordFingerprint && safeEqual(fingerprint(account.email, parsed.data.password), account.temporaryPasswordFingerprint)) {
      throw new AppError('VALIDATION', 'Az új jelszó nem egyezhet meg az ideiglenes jelszóval.', { password: 'Az új jelszó nem egyezhet meg az ideiglenes jelszóval.' })
    }
    await completeTemporaryPasswordChange(userId, parsed.data.password)
    console.info('[ADMIN FIÓK]', { event: 'temporary-password-changed', userId })
  },
}
