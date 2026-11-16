import 'server-only'

import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'

import { payloadClient } from '@/dto/payload'
import { HOUR_MS } from '@/lib/clock'

/** Rolling window for the popularity ranking. */
export const POPULARITY_WINDOW_MS: number = 7 * 24 * HOUR_MS

export type PopularityRow = { id: string; units: number }

/**
 * Brands or categories ranked by units sold in the window (now − 7 days, now], then by manual order
 * (`_order`), then by id. Computed with one aggregate query on every call, so the ranking follows new
 * sales and sales leaving the window without any refresh job. Without sales it is the manual order.
 */
export async function rankByWeeklySales(dimension: 'brand' | 'category', limit: number, now: Date): Promise<PopularityRow[]> {
  const payload = await payloadClient()
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const table = sql.identifier(dimension === 'brand' ? 'brands' : 'categories')
  const from = new Date(now.getTime() - POPULARITY_WINDOW_MS).toISOString()
  const result = await db.execute(sql`
    select t.id, coalesce(s.units, 0)::int as units
    from ${table} t
    left join (
      select key, sum(quantity) as units from sale_entries
      where dimension = ${dimension} and sold_at > ${from} and sold_at <= ${now.toISOString()}
      group by key
    ) s on s.key = t.id
    order by units desc, t._order asc nulls last, t.id asc
    limit ${limit}`)
  return result.rows.map((row) => ({ id: String((row as { id: unknown }).id), units: Number((row as { units: unknown }).units) }))
}
