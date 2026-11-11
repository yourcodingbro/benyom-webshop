import 'server-only'

import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import { copy, sampleStore } from '@/dto/sample-store'
import type { AuthorizationContext } from '@/types/auth'
import type { Brand } from '@/types/catalog'

export async function getBrands(): Promise<Brand[]> {
  return copy([...sampleStore().brands].sort((a: Brand, b: Brand) => a.sortOrder - b.sortOrder))
}

/** Most popular brands by the explicit ranking (sample: `popularityRank` in sample.ts; later a Payload field). */
export async function getPopularBrands(limit: number): Promise<Brand[]> {
  return copy([...sampleStore().brands].sort((a: Brand, b: Brand) => a.popularityRank - b.popularityRank).slice(0, limit))
}

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  const brand = sampleStore().brands.find((item: Brand) => item.slug === slug)
  return brand ? copy(brand) : null
}

export async function addBrand(input: Omit<Brand, 'id'>, auth: AuthorizationContext): Promise<Brand> {
  assertAdminOrSystem(auth)
  const store = sampleStore()
  if (store.brands.some((brand: Brand) => brand.slug === input.slug)) throw new AppError('CONFLICT', 'Ez a márka már létezik.')
  const brand: Brand = { ...input, id: `brand-${input.slug}` }
  store.brands.push(brand)
  return copy(brand)
}
