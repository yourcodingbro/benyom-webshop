import { describeColor } from '@/lib/hex'
import type { Orderability, Product, ProductImage, ProductVariant, VariantAttributes } from '@/types/catalog'
import type { HufAmount } from '@/types/common'

/** Product-level unavailability overrides the variant. */
export function effectiveOrderability(product: Product, variant: ProductVariant): Orderability {
  if (product.orderability !== 'preorderable') return product.orderability
  return variant.orderability
}

export function isVariantOrderable(product: Product, variant: ProductVariant): boolean {
  return product.status === 'published' && effectiveOrderability(product, variant) === 'preorderable'
}

export function priceRange(product: Product): { min: HufAmount; max: HufAmount } | null {
  const prices = product.variants.map((variant: ProductVariant) => variant.price)
  if (prices.length === 0) return null
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

export function variantImages(product: Product, variant: ProductVariant): ProductImage[] {
  const own = product.images.filter((image: ProductImage) => variant.imageIds.includes(image.id))
  return own.length > 0 ? own : product.images.filter((image: ProductImage) => image.colorHex === null)
}

export function primaryImage(product: Product): ProductImage | null {
  return product.images[0] ?? null
}

/** Human-readable attribute summary, e.g. "256 GB · 12 GB RAM · Fekete (#1C1C1E)". */
export function describeAttributes(attributes: VariantAttributes): string {
  const parts: string[] = []
  if (attributes.storageGb !== null) parts.push(formatStorage(attributes.storageGb))
  if (attributes.ramGb !== null) parts.push(`${attributes.ramGb} GB RAM`)
  if (attributes.caseSizeMm !== null) parts.push(`${attributes.caseSizeMm} mm`)
  if (attributes.colorHex !== null) parts.push(describeColor(attributes.colorHex, attributes.colorLabel))
  return parts.join(' · ')
}

export function formatStorage(storageGb: number): string {
  return storageGb >= 1024 && storageGb % 1024 === 0 ? `${storageGb / 1024} TB` : `${storageGb} GB`
}

/** Case- and accent-insensitive search key. */
export function searchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
