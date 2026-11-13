import 'server-only'

import { isUniqueViolation, payloadClient } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { randomToken } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import type { ContactMessage as ContactDoc } from '@/payload-types'
import type { AuthorizationContext } from '@/types/auth'
import type { ContactMessage } from '@/types/contact'

export type NewContactMessage = Omit<ContactMessage, 'id' | 'notificationStatus'>

function toMessage(doc: ContactDoc): ContactMessage {
  return {
    id: doc.id,
    submissionKey: doc.submissionKey,
    name: doc.name,
    email: doc.email,
    subject: doc.subject,
    message: doc.message,
    privacyVersion: doc.privacyVersion ?? '',
    receivedAt: doc.receivedAt,
    notificationStatus: doc.notificationStatus,
  }
}

async function findByKey(submissionKey: string): Promise<ContactDoc | null> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'contact-messages', where: { submissionKey: { equals: submissionKey } }, limit: 1, depth: 0, overrideAccess: true })
  return result.docs[0] ?? null
}

/** Idempotent insert keyed by `submissionKey` (unique index): a retried submission returns the stored message. */
export async function addContactMessage(input: NewContactMessage): Promise<{ message: ContactMessage; created: boolean }> {
  const existing = await findByKey(input.submissionKey)
  if (existing) return { message: toMessage(existing), created: false }
  const payload = await payloadClient()
  try {
    const doc = await payload.create({
      collection: 'contact-messages',
      data: { ...input, id: `msg-${randomToken(9).replace(/[^A-Za-z0-9]/g, 'x')}`, notificationStatus: 'pending' },
      overrideAccess: true,
    })
    return { message: toMessage(doc), created: true }
  } catch (error: unknown) {
    if (!isUniqueViolation(error)) throw error
    const winner = await findByKey(input.submissionKey)
    if (!winner) throw error
    return { message: toMessage(winner), created: false }
  }
}

export async function getContactMessage(id: string, auth: AuthorizationContext): Promise<ContactMessage | null> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'contact-messages', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
  const doc = result.docs[0]
  return doc ? toMessage(doc) : null
}

export async function updateContactMessageStatus(id: string, status: ContactMessage['notificationStatus'], auth: AuthorizationContext): Promise<void> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.update({ collection: 'contact-messages', where: { id: { equals: id } }, data: { notificationStatus: status }, overrideAccess: true })
  if (result.docs.length === 0) throw new AppError('NOT_FOUND', 'Az üzenet nem található.')
}

export async function getContactMessages(auth: AuthorizationContext): Promise<ContactMessage[]> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'contact-messages', sort: '-receivedAt', limit: 200, depth: 0, overrideAccess: true })
  return result.docs.map(toMessage)
}
