import 'server-only'

import type { PayloadRequest } from 'payload'

import { lockRow } from '@/collections/hooks/db'
import { isUniqueViolation, payloadClient, withTransaction } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import type { User as UserDoc } from '@/payload-types'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'

/** Security state of an admin account. The fingerprint is a keyed hash, never the password. */
export type AdminAccount = {
  id: string
  email: string
  mustChangePassword: boolean
  temporaryPasswordExpiresAt: IsoDateTime | null
  temporaryPasswordFingerprint: string | null
}

export type TemporaryCredentials = {
  password: string
  expiresAt: IsoDateTime
  fingerprint: string
}

function toAccount(doc: UserDoc): AdminAccount {
  return {
    id: String(doc.id),
    email: doc.email,
    mustChangePassword: doc.mustChangePassword === true,
    temporaryPasswordExpiresAt: doc.temporaryPasswordExpiresAt ?? null,
    temporaryPasswordFingerprint: doc.temporaryPasswordFingerprint ?? null,
  }
}

/** Full access read (includes the hidden fingerprint); server code only. */
export async function getAdminAccount(id: string, auth: AuthorizationContext): Promise<AdminAccount | null> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'users', where: { id: { equals: Number(id) } }, limit: 1, depth: 0, overrideAccess: true, showHiddenFields: true })
  const doc = result.docs[0]
  return doc ? toAccount(doc) : null
}

/** Creates the admin with Payload's native password hashing; the plaintext is not stored anywhere. */
export async function createInvitedAdmin(email: string, credentials: TemporaryCredentials, auth: AuthorizationContext): Promise<AdminAccount> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  try {
    const doc = await payload.create({
      collection: 'users',
      data: {
        email,
        password: credentials.password,
        roles: ['admin'],
        mustChangePassword: true,
        temporaryPasswordExpiresAt: credentials.expiresAt,
        temporaryPasswordFingerprint: credentials.fingerprint,
      },
      overrideAccess: true,
      showHiddenFields: true,
    })
    return toAccount(doc)
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Ezzel az e-mail-címmel már létezik felhasználó.', { email: 'Ez az e-mail-cím már foglalt.' })
    throw error
  }
}

/**
 * Issues new temporary credentials: replaces the password hash (the previous temporary password stops
 * working), resets the expiry and lockout, and ends every existing session of the account.
 */
export async function resetTemporaryCredentials(id: string, credentials: TemporaryCredentials, auth: AuthorizationContext): Promise<AdminAccount> {
  assertAdminOrSystem(auth)
  return withTransaction(async (req: PayloadRequest): Promise<AdminAccount> => {
    if (!(await lockRow(req, 'users', Number(id)))) throw new AppError('NOT_FOUND', 'A felhasználó nem található.')
    const doc = await req.payload.update({
      collection: 'users',
      id: Number(id),
      data: {
        password: credentials.password,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: credentials.expiresAt,
        temporaryPasswordFingerprint: credentials.fingerprint,
        sessions: [],
        loginAttempts: 0,
        lockUntil: null,
      },
      req,
      overrideAccess: true,
      showHiddenFields: true,
    })
    return toAccount(doc)
  })
}

/**
 * Sets the user's own password and, in the same transaction, clears the first-login flag, the expiry and
 * the fingerprint, and ends all sessions (the temporary login included). Refuses if the flag was already
 * cleared concurrently.
 */
export async function completeTemporaryPasswordChange(id: string, password: string): Promise<void> {
  await withTransaction(async (req: PayloadRequest): Promise<void> => {
    const row = await lockRow(req, 'users', Number(id))
    if (!row) throw new AppError('NOT_FOUND', 'A felhasználó nem található.')
    if (row.must_change_password !== true) throw new AppError('INVALID_STATE', 'A jelszó már módosítva lett. Jelentkezzen be az új jelszóval.')
    await req.payload.update({
      collection: 'users',
      id: Number(id),
      data: { password, mustChangePassword: false, temporaryPasswordExpiresAt: null, temporaryPasswordFingerprint: null, sessions: [], loginAttempts: 0, lockUntil: null },
      req,
      overrideAccess: true,
    })
  })
}

export async function setLastInvitationEmail(id: string, emailMessageId: number | null, auth: AuthorizationContext): Promise<void> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  await payload.update({ collection: 'users', id: Number(id), data: { lastInvitationEmail: emailMessageId }, overrideAccess: true })
}
