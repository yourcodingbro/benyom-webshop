'use client'

import { useCallback, useMemo, useState } from 'react'

import { priceRange, variantImages } from '@/lib/catalog'
import {
  applyChoice,
  type DimensionValue,
  matchingVariants,
  missingDimensions,
  optionStates,
  resolveVariant,
  selectableDimensions,
  selectionFromVariant,
  type VariantDimension,
  type VariantOptionState,
  type VariantSelection,
} from '@/lib/variant-selection'
import type { Product, ProductImage, ProductVariant } from '@/types/catalog'
import type { HufAmount } from '@/types/common'

type UseVariantSelectionParams = {
  product: Product
  /** Preselected variant (product page). Null means the customer must choose everything. */
  initialSku: string | null
  /** Fill unchosen dimensions from the closest variant after each choice (product page). */
  autoComplete: boolean
}

export type UseVariantSelectionResult = {
  dimensions: VariantDimension[]
  selection: VariantSelection
  /** Exact variant once the selection is complete; never guessed. */
  selectedVariant: ProductVariant | null
  missing: VariantDimension[]
  options: (dimension: VariantDimension) => VariantOptionState[]
  choose: (dimension: VariantDimension, value: DimensionValue) => ProductVariant | null
  image: ProductImage | null
  /** Price span of the variants still matching the current choices. */
  price: { min: HufAmount; max: HufAmount } | null
}

/** Shared variant-selection state for the product page and the compact product preview. */
export function useVariantSelection(params: UseVariantSelectionParams): UseVariantSelectionResult {
  const { product, autoComplete } = params
  const [selection, setSelection] = useState<VariantSelection>(() => {
    const initial = product.variants.find((variant) => variant.sku === params.initialSku)
    return initial ? selectionFromVariant(product, initial) : {}
  })

  const dimensions = useMemo<VariantDimension[]>(() => selectableDimensions(product), [product])
  const selectedVariant = resolveVariant(product, selection)
  const candidates = matchingVariants(product, selection)

  const choose = useCallback(
    (dimension: VariantDimension, value: DimensionValue): ProductVariant | null => {
      const next = applyChoice(product, selection, dimension, value, autoComplete)
      setSelection(next)
      return resolveVariant(product, next)
    },
    [product, selection, autoComplete],
  )

  const colorHex = typeof selection.colorHex === 'string' ? selection.colorHex : null
  const image =
    (selectedVariant ? variantImages(product, selectedVariant)[0] : undefined) ??
    (colorHex ? product.images.find((item) => item.colorHex === colorHex) : undefined) ??
    product.images[0] ??
    null
  const prices = candidates.map((variant) => variant.price)

  return {
    dimensions,
    selection,
    selectedVariant,
    missing: missingDimensions(product, selection),
    options: (dimension: VariantDimension) => optionStates(product, selection, dimension),
    choose,
    image,
    price: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : priceRange(product),
  }
}
