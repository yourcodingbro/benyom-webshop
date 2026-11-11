import { effectiveOrderability, formatStorage } from '@/lib/catalog'
import { describeColor } from '@/lib/hex'
import type { Product, ProductVariant, VariantAttributes } from '@/types/catalog'

export type VariantDimension = 'colorHex' | 'storageGb' | 'caseSizeMm' | 'ramGb'
export type DimensionValue = string | number
/** Customer choices per dimension; a missing key means "not chosen yet". */
export type VariantSelection = Partial<Record<VariantDimension, DimensionValue>>

export type VariantOptionState = {
  value: DimensionValue
  /** Some variant has this value together with every other current choice. */
  combinable: boolean
  /** At least one such variant can be ordered. */
  orderable: boolean
}

const DIMENSIONS: readonly VariantDimension[] = ['colorHex', 'storageGb', 'caseSizeMm', 'ramGb']

function valueOf(attributes: VariantAttributes, dimension: VariantDimension): DimensionValue | null {
  return attributes[dimension]
}

function isOrderable(product: Product, variant: ProductVariant): boolean {
  return effectiveOrderability(product, variant) === 'preorderable'
}

/**
 * Dimensions the customer must choose: those with more than one value, minus any that the
 * remaining ones fully determine (e.g. RAM fixed by storage), checked from the least important.
 */
export function selectableDimensions(product: Product): VariantDimension[] {
  const varying = DIMENSIONS.filter((dimension: VariantDimension) => new Set(product.variants.map((variant) => valueOf(variant.attributes, dimension))).size > 1)
  for (const dimension of [...varying].reverse()) {
    const others = varying.filter((other: VariantDimension) => other !== dimension)
    if (others.length === 0) continue
    const seen = new Map<string, DimensionValue | null>()
    const determined = product.variants.every((variant: ProductVariant) => {
      const key = JSON.stringify(others.map((other: VariantDimension) => valueOf(variant.attributes, other)))
      const value = valueOf(variant.attributes, dimension)
      if (seen.has(key) && seen.get(key) !== value) return false
      seen.set(key, value)
      return true
    })
    if (determined) varying.splice(varying.indexOf(dimension), 1)
  }
  return varying
}

export function matchingVariants(product: Product, selection: VariantSelection): ProductVariant[] {
  return product.variants.filter((variant: ProductVariant) =>
    DIMENSIONS.every((dimension: VariantDimension) => selection[dimension] === undefined || valueOf(variant.attributes, dimension) === selection[dimension]),
  )
}

export function missingDimensions(product: Product, selection: VariantSelection): VariantDimension[] {
  return selectableDimensions(product).filter((dimension: VariantDimension) => selection[dimension] === undefined)
}

/** The exact variant, or null until every selectable dimension is chosen. Never guesses. */
export function resolveVariant(product: Product, selection: VariantSelection): ProductVariant | null {
  if (missingDimensions(product, selection).length > 0) return null
  return matchingVariants(product, selection)[0] ?? null
}

export function selectionFromVariant(product: Product, variant: ProductVariant): VariantSelection {
  const selection: VariantSelection = {}
  for (const dimension of selectableDimensions(product)) {
    const value = valueOf(variant.attributes, dimension)
    if (value !== null) selection[dimension] = value
  }
  return selection
}

export function optionStates(product: Product, selection: VariantSelection, dimension: VariantDimension): VariantOptionState[] {
  const values = [...new Set(product.variants.map((variant) => valueOf(variant.attributes, dimension)).filter((value): value is DimensionValue => value !== null))]
  return values.map((value: DimensionValue) => {
    const candidates = matchingVariants(product, { ...selection, [dimension]: value })
    return { value, combinable: candidates.length > 0, orderable: candidates.some((variant) => isOrderable(product, variant)) }
  })
}

/**
 * Applies a choice so the selection always stays a valid combination: earlier choices that no
 * longer combine with the new value are dropped. With `autoComplete` (product page) the
 * remaining dimensions are filled from the closest existing variant, preferring orderable ones.
 */
export function applyChoice(product: Product, selection: VariantSelection, dimension: VariantDimension, value: DimensionValue, autoComplete: boolean): VariantSelection {
  const next: VariantSelection = { [dimension]: value }
  for (const other of selectableDimensions(product)) {
    const previous = selection[other]
    if (other === dimension || previous === undefined) continue
    if (matchingVariants(product, { ...next, [other]: previous }).length > 0) next[other] = previous
  }
  if (!autoComplete) return next
  const best = [...matchingVariants(product, next)].sort((a, b) => Number(isOrderable(product, b)) - Number(isOrderable(product, a)))[0]
  return best ? selectionFromVariant(product, best) : next
}

export function optionLabel(product: Product, dimension: VariantDimension, value: DimensionValue): string {
  if (dimension === 'colorHex' && typeof value === 'string') {
    const label = product.variants.find((variant) => variant.attributes.colorHex === value)?.attributes.colorLabel ?? null
    return describeColor(value, label)
  }
  if (typeof value === 'number') return dimension === 'storageGb' ? formatStorage(value) : dimension === 'ramGb' ? `${value} GB RAM` : `${value} mm`
  return String(value)
}
