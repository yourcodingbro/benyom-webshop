import 'server-only'

import type { Where } from 'payload'

import { isReservedProductSlug, reserveProductSlug, tryReserveProductSlug } from '@/collections/hooks/slugs'
import { payloadClient } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import type { AuthorizationContext } from '@/types/auth'

export type UploadedFile = { data: Buffer; mimetype: string; name: string; size: number }

export type ProductMediaInput = {
  alt: string
  brandSlug: string
  categorySlug: string
  productSlug: string
  colorHex: string | null
  /** brand/category/product/[color]: the directory part of the object key. */
  prefix: string
}

export type CreatedMedia = { id: number; objectKey: string | null; url: string | null; filename: string | null; alt: string }

/** Slug of a brand or category by id, or null when it does not exist. */
export async function getTaxonomySlug(collection: 'brands' | 'categories', id: string): Promise<string | null> {
  const payload = await payloadClient()
  const result = await payload.find({ collection, where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
  return result.docs[0]?.slug ?? null
}

/** Stored slug of a saved product (latest draft included), or null. */
export async function getStoredProductSlug(id: string, auth: AuthorizationContext): Promise<string | null> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'products', where: { id: { equals: id } }, limit: 1, depth: 0, draft: true, overrideAccess: true })
  return result.docs[0]?.slug ?? null
}

/** Generates and reserves a unique slug for an unsaved product. */
export async function reserveSlugForName(name: string, now: Date, auth: AuthorizationContext): Promise<string> {
  assertAdminOrSystem(auth)
  return reserveProductSlug(await payloadClient(), name, now)
}

/**
 * Confirms a slug sent back by an unsaved product form: valid only while it is reserved, or (after the
 * reservation expired) when no product uses it and it can be reserved again. Never trusts the client.
 */
export async function confirmReservedSlug(slug: string, now: Date, auth: AuthorizationContext): Promise<boolean> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const used = await payload.count({ collection: 'products', where: { slug: { equals: slug } }, overrideAccess: true })
  const former = await payload.count({ collection: 'product-slug-history', where: { slug: { equals: slug } }, overrideAccess: true })
  if (used.totalDocs > 0 || former.totalDocs > 0) return false
  return (await isReservedProductSlug(payload, slug, now)) || tryReserveProductSlug(payload, slug, now)
}

/** Stores an image under the server-derived prefix (Supabase Storage through the S3 adapter). */
export async function createProductMedia(input: ProductMediaInput, file: UploadedFile, auth: AuthorizationContext): Promise<CreatedMedia> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  let doc
  try {
    doc = await payload.create({ collection: 'media', data: { ...input, uploadOrigin: 'product-form' }, file, overrideAccess: true })
  } catch (error: unknown) {
    // The Media collection refuses uploads (503) while Supabase Storage is not configured.
    const status = error instanceof Error && 'status' in error ? (error as { status: unknown }).status : null
    if (status === 503 && error instanceof Error) throw new AppError('UNAVAILABLE', error.message)
    throw error
  }
  return { id: doc.id, objectKey: doc.objectKey ?? null, url: doc.url ?? null, filename: doc.filename ?? null, alt: doc.alt }
}

/**
 * Deletes product-form uploads older than `before` that no product references, neither the current
 * document nor any saved version (so restoring a version never breaks). Imported or shared media is
 * never touched. Returns the number of deleted files.
 */
export async function deleteAbandonedProductMedia(before: Date, limit: number, auth: AuthorizationContext): Promise<number> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const candidates = await payload.find({
    collection: 'media',
    where: { and: [{ uploadOrigin: { equals: 'product-form' } }, { createdAt: { less_than: before.toISOString() } }] },
    limit,
    depth: 0,
    overrideAccess: true,
  })
  let deleted = 0
  for (const media of candidates.docs) {
    const referencedBy: Where = { or: [{ images: { contains: media.id } }, { 'variants.images': { contains: media.id } }] }
    const current = await payload.count({ collection: 'products', where: referencedBy, overrideAccess: true })
    if (current.totalDocs > 0) continue
    const versions = await payload.countVersions({
      collection: 'products',
      where: { or: [{ 'version.images': { contains: media.id } }, { 'version.variants.images': { contains: media.id } }] },
      overrideAccess: true,
    })
    if (versions.totalDocs > 0) continue
    await payload.delete({ collection: 'media', id: media.id, overrideAccess: true })
    deleted += 1
  }
  return deleted
}

/** Drops reservations that expired; their slugs become available again. */
export async function deleteExpiredSlugReservations(now: Date, auth: AuthorizationContext): Promise<number> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.delete({ collection: 'product-slug-reservations', where: { expiresAt: { less_than_equal: now.toISOString() } }, overrideAccess: true })
  return result.docs.length
}
