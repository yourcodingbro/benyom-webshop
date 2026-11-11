import { beforeEach, describe, expect, it } from 'vitest'

import { getPopularBrands } from '@/dto/brands'
import { getPopularCategories } from '@/dto/categories'
import { getProductBySlug } from '@/dto/products'
import { applyChoice, missingDimensions, optionStates, resolveVariant, selectableDimensions } from '@/lib/variant-selection'
import { resetWorld } from '@/tests/helpers'
import type { Product } from '@/types/catalog'

beforeEach(resetWorld)

async function product(slug: string): Promise<Product> {
  const found = await getProductBySlug(slug)
  if (!found) throw new Error(`missing ${slug}`)
  return found
}

describe('popularity ranking', () => {
  it('returns the top three brands and categories by explicit rank', async () => {
    expect((await getPopularBrands(3)).map((brand) => brand.slug)).toEqual(['apple', 'samsung', 'xiaomi'])
    expect((await getPopularCategories(3)).map((category) => category.slug)).toEqual(['mobiltelefon', 'okosora', 'tablet'])
  })
})

describe('variant selection', () => {
  it('requires every selectable dimension before resolving a variant', async () => {
    const iphone = await product('iphone-17-pro')
    expect(selectableDimensions(iphone)).toEqual(['colorHex', 'storageGb'])
    const colorOnly = applyChoice(iphone, {}, 'colorHex', '#E8742A', false)
    expect(resolveVariant(iphone, colorOnly)).toBeNull()
    expect(missingDimensions(iphone, colorOnly)).toEqual(['storageGb'])
    const complete = applyChoice(iphone, colorOnly, 'storageGb', 512, false)
    expect(resolveVariant(iphone, complete)?.sku).toBe('APL-IP17P-512-02')
  })

  it('marks unavailable combinations and never preselects for the preview', async () => {
    const iphone = await product('iphone-17-pro')
    const orange = applyChoice(iphone, {}, 'colorHex', '#E8742A', false)
    const terabyte = optionStates(iphone, orange, 'storageGb').find((option) => option.value === 1024)
    expect(terabyte).toEqual({ value: 1024, combinable: true, orderable: false })
    expect(resolveVariant(iphone, {})).toBeNull()
  })

  it('drops earlier choices that no longer combine, and auto-completes only on request', async () => {
    const watch = await product('apple-watch-ultra-3')
    expect(resolveVariant(watch, applyChoice(watch, {}, 'colorHex', '#D9CDB8', false))?.sku).toBe('APL-AWU3-49MM-02')
    // Remove orange 1 TB: choosing 1 TB after orange must drop the orange choice.
    const iphone = await product('iphone-17-pro')
    const sparse: Product = { ...iphone, variants: iphone.variants.filter((variant) => variant.sku !== 'APL-IP17P-1TB-02') }
    const orange = applyChoice(sparse, {}, 'colorHex', '#E8742A', false)
    expect(optionStates(sparse, orange, 'storageGb').find((option) => option.value === 1024)?.combinable).toBe(false)
    expect(applyChoice(sparse, orange, 'storageGb', 1024, false)).toEqual({ storageGb: 1024 })
    expect(resolveVariant(sparse, applyChoice(sparse, orange, 'storageGb', 1024, true))?.sku).toBe('APL-IP17P-1TB-01')
  })

  it('does not ask for attributes that other choices determine (RAM fixed by storage)', async () => {
    const ipad = await product('ipad-pro-11')
    expect(selectableDimensions(ipad)).toEqual(['colorHex', 'storageGb'])
    const selection = applyChoice(ipad, applyChoice(ipad, {}, 'colorHex', '#2E2E30', false), 'storageGb', 1024, false)
    expect(resolveVariant(ipad, selection)?.attributes.ramGb).toBe(16)
  })

  it('treats single-variant products as already complete', async () => {
    const airpods = await product('airpods-pro-3')
    expect(selectableDimensions(airpods)).toEqual([])
    expect(resolveVariant(airpods, {})?.sku).toBe('APL-APP3-STD-01')
  })
})
