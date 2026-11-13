import 'server-only'

import { toBrand } from '@/dto/catalog-mappers'
import { isUniqueViolation, payloadClient } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import type { AuthorizationContext } from '@/types/auth'
import type { Brand } from '@/types/catalog'

export async function getBrands(): Promise<Brand[]> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'brands', sort: ['sortOrder', 'name'], pagination: false, depth: 0 })
  return result.docs.map(toBrand)
}

/** Most popular brands by the explicit editorial ranking (`popularityRank`). */
export async function getPopularBrands(limit: number): Promise<Brand[]> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'brands', sort: ['popularityRank', 'name'], limit, depth: 0 })
  return result.docs.map(toBrand)
}

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'brands', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  const doc = result.docs[0]
  return doc ? toBrand(doc) : null
}

export async function addBrand(input: Omit<Brand, 'id'> & { id?: string }, auth: AuthorizationContext): Promise<Brand> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  try {
    const doc = await payload.create({ collection: 'brands', data: { ...input, id: input.id ?? `brand-${input.slug}` }, overrideAccess: true })
    return toBrand(doc)
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Ez a márka már létezik.')
    throw error
  }
}
