import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { HOUR_MS } from '@/lib/clock'
import { slugify } from '@/lib/slug'

/** How long a product slug reserved by an unsaved product form (e.g. for an image upload) stays held. */
export const SLUG_RESERVATION_TTL_MS: number = 7 * 24 * HOUR_MS

const MAX_SLUG_LENGTH: number = 80
const MAX_ATTEMPTS: number = 500

type SluggedCollection = 'brands' | 'categories' | 'products'

/** `base`, `base-2`, `base-3` … always within the 80-character slug limit. */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt === 1) return base
  const suffix = `-${attempt}`
  return `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`
}

/** Slugs in use that could collide with candidates of `base` (substring match on a shortened base). */
async function takenSlugs(payload: Payload, collection: SluggedCollection, base: string, req?: PayloadRequest): Promise<Set<string>> {
  const result = await payload.find({ collection, where: { slug: { like: base.slice(0, 60) } }, pagination: false, depth: 0, overrideAccess: true, req })
  return new Set(result.docs.map((doc) => doc.slug))
}

/**
 * First free slug for a brand or category name. The unique index stays the final guard: a concurrent
 * create of the same name fails with a duplicate error instead of producing two equal slugs.
 */
export async function freeSlug(payload: Payload, collection: 'brands' | 'categories', name: string, req: PayloadRequest): Promise<string> {
  const base = slugify(name) || (collection === 'brands' ? 'marka' : 'kategoria')
  const taken = await takenSlugs(payload, collection, base, req)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = slugCandidate(base, attempt)
    if (!taken.has(candidate)) return candidate
  }
  throw new Error('Nem található szabad URL-azonosító.')
}

type Database = Pick<PostgresAdapter['drizzle'], 'execute'>

/** The request's open transaction when there is one (so the caller's connection is reused), else autocommit. */
async function database(payload: Payload, req?: PayloadRequest): Promise<Database> {
  const adapter = payload.db as unknown as PostgresAdapter
  const transactionId = req?.transactionID ? await req.transactionID : undefined
  const session = transactionId !== undefined && transactionId !== null ? adapter.sessions[transactionId] : undefined
  return session ? session.db : adapter.drizzle
}

/**
 * Atomically reserves exactly `slug` for a product. `INSERT … ON CONFLICT` takes a free or expired slug
 * in one statement and never raises, so it is safe inside the caller's transaction: a concurrent
 * request reserving the same slug waits for it and then moves on to the next candidate.
 */
export async function tryReserveProductSlug(payload: Payload, slug: string, now: Date, req?: PayloadRequest): Promise<boolean> {
  const db = await database(payload, req)
  const expiresAt = new Date(now.getTime() + SLUG_RESERVATION_TTL_MS).toISOString()
  const reserved = await db.execute(sql`
    insert into product_slug_reservations (slug, expires_at) values (${slug}, ${expiresAt})
    on conflict (slug) do update set expires_at = excluded.expires_at, updated_at = now()
    where product_slug_reservations.expires_at <= ${now.toISOString()}
    returning id`)
  if (reserved.rows.length === 0) return false
  // A product may have taken the slug while this request waited for a concurrent reservation.
  const used = await db.execute(sql`select 1 from products where slug = ${slug} union all select 1 from product_slug_history where slug = ${slug} limit 1`)
  if (used.rows.length === 0) return true
  await db.execute(sql`delete from product_slug_reservations where slug = ${slug}`)
  return false
}

/** Generates and reserves a unique product slug from the full product name (`Nothing Phone (3)` → `nothing-phone-3`). */
export async function reserveProductSlug(payload: Payload, name: string, now: Date, req?: PayloadRequest): Promise<string> {
  const base = slugify(name) || 'termek'
  const taken = await takenSlugs(payload, 'products', base, req)
  const reserved = await payload.find({
    collection: 'product-slug-reservations',
    where: { and: [{ slug: { like: base.slice(0, 60) } }, { expiresAt: { greater_than: now.toISOString() } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const reservation of reserved.docs) taken.add(reservation.slug)
  const former = await payload.find({ collection: 'product-slug-history', where: { slug: { like: base.slice(0, 60) } }, pagination: false, depth: 0, overrideAccess: true, req })
  for (const entry of former.docs) taken.add(entry.slug)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = slugCandidate(base, attempt)
    if (taken.has(candidate)) continue
    if (await tryReserveProductSlug(payload, candidate, now, req)) return candidate
  }
  throw new Error('Nem található szabad URL-azonosító.')
}

/** True when `slug` is held by an unexpired reservation (made by any product form). */
export async function isReservedProductSlug(payload: Payload, slug: string, now: Date): Promise<boolean> {
  const result = await payload.count({
    collection: 'product-slug-reservations',
    where: { and: [{ slug: { equals: slug } }, { expiresAt: { greater_than: now.toISOString() } }] },
    overrideAccess: true,
  })
  return result.totalDocs > 0
}
