import 'server-only'

import { assertAdminOrSystem } from '@/lib/authorization'
import { randomToken } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { copy, sampleStore } from '@/dto/sample-store'
import type { AuthorizationContext } from '@/types/auth'
import type { ContactMessage } from '@/types/contact'

export type NewContactMessage = Omit<ContactMessage, 'id' | 'notificationStatus'>

/**
 * Idempotent insert keyed by `submissionKey`: a retried submission returns the stored message.
 * Payload later: a `contact-messages` collection with a unique index on submissionKey.
 */
export async function addContactMessage(input: NewContactMessage): Promise<{ message: ContactMessage; created: boolean }> {
  const store = sampleStore()
  const existing = store.contactMessages.find((item: ContactMessage) => item.submissionKey === input.submissionKey)
  if (existing) return { message: copy(existing), created: false }
  const message: ContactMessage = { ...copy(input), id: `msg-${randomToken(9)}`, notificationStatus: 'pending' }
  store.contactMessages.push(message)
  return { message: copy(message), created: true }
}

export async function updateContactMessageStatus(id: string, status: ContactMessage['notificationStatus'], auth: AuthorizationContext): Promise<void> {
  assertAdminOrSystem(auth)
  const message = sampleStore().contactMessages.find((item: ContactMessage) => item.id === id)
  if (!message) throw new AppError('NOT_FOUND', 'Az üzenet nem található.')
  message.notificationStatus = status
}

export async function getContactMessages(auth: AuthorizationContext): Promise<ContactMessage[]> {
  assertAdminOrSystem(auth)
  return copy(sampleStore().contactMessages)
}
