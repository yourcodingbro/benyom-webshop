import 'server-only'

import config from '@payload-config'
import { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction, type Payload, type PayloadRequest } from 'payload'

import type { AuditEventInput, OrderWriteContext } from '@/types/workflow'

/**
 * The only way application code reaches the database: Payload's Local API on Supabase PostgreSQL.
 * Private to `src/dto/`. A failed database operation always throws; there is no sample fallback.
 */
export async function payloadClient(): Promise<Payload> {
  return getPayload({ config })
}

/**
 * Runs `work` in one database transaction. Every Local API call inside must pass the given `req`
 * (and with it the transaction); collection hooks (audit trail, email jobs) join it automatically, so
 * a change can never be committed without its audit entries and queued notifications.
 */
export async function withTransaction<T>(work: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const payload = await payloadClient()
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    const result = await work(req)
    await commitTransaction(req)
    return result
  } catch (error: unknown) {
    await killTransaction(req)
    throw error
  }
}

/**
 * Full `req.context` for a service-driven order write. Payload merges context into the shared request,
 * so every write sets all flags explicitly; nothing leaks from an earlier write in the same transaction.
 */
export function orderWriteContext(events: AuditEventInput[], options: { skipStatusNotification?: boolean; suppressSideEffects?: boolean } = {}): OrderWriteContext {
  return {
    workflow: true,
    auditEvents: events,
    skipStatusNotification: options.skipStatusNotification ?? false,
    suppressSideEffects: options.suppressSideEffects ?? false,
  }
}

/** Payload returns relationship values as ids or populated documents depending on depth. */
export function relationId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? String(id) : null
  }
  return null
}

/** Postgres 23505, or Payload's ValidationError for a `unique` field (message is localized). */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const details = error as Error & { cause?: { code?: unknown } | unknown; data?: unknown }
  if (details.cause && typeof details.cause === 'object' && 'code' in details.cause && (details.cause as { code?: unknown }).code === '23505') return true
  const text = `${error.message} ${JSON.stringify(details.data ?? '')} ${String(details.cause ?? '')}`
  return /duplicate key|unique constraint|23505|egyedinek kell|must be unique|already exists/i.test(text)
}
