import 'server-only'

import { assertAdminOrSystem } from '@/lib/authorization'
import { copy, sampleStore } from '@/dto/sample-store'
import type { AuthorizationContext } from '@/types/auth'
import type { EmailLogEntry } from '@/types/email'

const MAX_ENTRIES: number = 200

/** Records a simulated email attempt. Later this becomes a persisted notification/outbox row. */
export async function addEmailLogEntry(entry: EmailLogEntry): Promise<void> {
  const store = sampleStore()
  store.emailLog.unshift(copy(entry))
  store.emailLog.length = Math.min(store.emailLog.length, MAX_ENTRIES)
}

export async function getEmailLogEntries(auth: AuthorizationContext): Promise<EmailLogEntry[]> {
  assertAdminOrSystem(auth)
  return copy(sampleStore().emailLog)
}

export async function getEmailLogEntry(id: string, auth: AuthorizationContext): Promise<EmailLogEntry | null> {
  assertAdminOrSystem(auth)
  const entry = sampleStore().emailLog.find((item: EmailLogEntry) => item.id === id)
  return entry ? copy(entry) : null
}
