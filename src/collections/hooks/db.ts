import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

/** Payload table names: collection slug with dashes as underscores. */
export function tableName(collectionSlug: string): string {
  return collectionSlug.replace(/-/g, '_')
}

/**
 * Locks one row (`SELECT … FOR UPDATE`) inside the request's open Payload transaction and returns its
 * columns. Concurrent writers of the same row wait here, so check-and-set logic that follows (version,
 * status) cannot interleave. Uses Payload's own Postgres adapter session; there is no separate client.
 */
export async function lockRow(req: PayloadRequest, collectionSlug: string, id: string | number): Promise<Record<string, unknown> | null> {
  const adapter = req.payload.db as unknown as PostgresAdapter
  const transactionId = req.transactionID ? await req.transactionID : undefined
  const session = transactionId !== undefined && transactionId !== null ? adapter.sessions[transactionId] : undefined
  if (!session) throw new Error('lockRow: nincs nyitott tranzakció.')
  const result = await session.db.execute(sql`select * from ${sql.identifier(tableName(collectionSlug))} where id = ${id} for update`)
  const row = result.rows[0]
  return row ? (row as Record<string, unknown>) : null
}
