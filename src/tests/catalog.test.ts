import { beforeEach, describe, expect, it } from 'vitest'

import { getCategories } from '@/dto/categories'
import { getAllProducts, getProductBySlug, getProducts } from '@/dto/products'
import { effectiveOrderability, isVariantOrderable } from '@/lib/catalog'
import { hexToPathSegment, normalizeHexColor } from '@/lib/hex'
import { buildMediaObjectKey } from '@/lib/storage-path'
import { parseListingParams } from '@/schemas/listing'
import { ADMIN, resetWorld } from '@/tests/helpers'

beforeEach(resetWorld)

describe('HEX colors', () => {
  it('accepts only #RRGGBB and normalizes to uppercase', () => {
    expect(normalizeHexColor('#1c1c1e')).toBe('#1C1C1E')
    expect(normalizeHexColor('  #ABCDEF ')).toBe('#ABCDEF')
    for (const bad of ['1C1C1E', '#FFF', '#GGGGGG', '#1234567', 'fekete', '', null, 42]) {
      expect(normalizeHexColor(bad)).toBeNull()
    }
  })

  it('uses lowercase hex without # as media path segment', () => {
    expect(hexToPathSegment('#000000')).toBe('000000')
    expect(
      buildMediaObjectKey({ brandSlug: 'apple', categorySlug: 'mobiltelefon', productSlug: 'iphone-17', colorHex: '#000000', fileName: 'Előnézet.webp', uniqueSuffix: null }),
    ).toBe('apple/mobiltelefon/iphone-17/000000/elonezet.webp')
    expect(() => buildMediaObjectKey({ brandSlug: '../x', categorySlug: 'a', productSlug: 'b', colorHex: null, fileName: 'a.webp', uniqueSuffix: null })).toThrow()
    expect(() => buildMediaObjectKey({ brandSlug: 'a', categorySlug: 'a', productSlug: 'b', colorHex: null, fileName: 'a.exe', uniqueSuffix: null })).toThrow()
  })

  it('sample data has valid HEX values and globally unique SKUs', async () => {
    const products = await getAllProducts(ADMIN)
    const skus = products.flatMap((product) => product.variants.map((variant) => variant.sku))
    expect(new Set(skus).size).toBe(skus.length)
    for (const product of products) {
      for (const variant of product.variants) {
        if (variant.attributes.colorHex !== null) expect(normalizeHexColor(variant.attributes.colorHex)).toBe(variant.attributes.colorHex)
        expect(Number.isSafeInteger(variant.price)).toBe(true)
        expect(variant.sku).not.toContain(variant.attributes.colorHex?.slice(1) ?? '###')
      }
    }
  })
})

describe('catalog queries', () => {
  it('hides drafts and discontinued products from listings but keeps discontinued pages', async () => {
    const all = await getProducts({ pageSize: 48 })
    const slugs = all.items.map((product) => product.slug)
    expect(slugs).not.toContain('galaxy-s26-edge')
    expect(slugs).not.toContain('iphone-15')
    expect(await getProductBySlug('galaxy-s26-edge')).toBeNull()
    const discontinued = await getProductBySlug('iphone-15')
    expect(discontinued?.orderability).toBe('discontinued')
  })

  it('paginates, filters and searches by name, brand, model and SKU', async () => {
    const first = await getProducts({ page: 1 })
    expect(first.totalPages).toBeGreaterThan(1)
    expect((await getProducts({ brandSlug: 'samsung', categorySlug: 'okosora' })).items.every((p) => p.brandId === 'brand-samsung')).toBe(true)
    expect((await getProducts({ search: 'SAM-S26U-512' })).items.map((p) => p.slug)).toEqual(['galaxy-s26-ultra'])
    expect((await getProducts({ search: 'apple watch' })).totalItems).toBe(3)
    expect((await getProducts({ search: 'galaxy s26' })).totalItems).toBe(2)
    const filtered = await getProducts({ storageGb: [2048] })
    expect(filtered.items.map((p) => p.slug)).toEqual(['iphone-17-pro-max'])
    const colored = await getProducts({ colors: ['#E8742A'] })
    expect(colored.items.every((p) => p.variants.some((v) => v.attributes.colorHex === '#E8742A'))).toBe(true)
    const cheap = await getProducts({ maxPrice: 150000, sort: 'price_asc' })
    expect(cheap.items.every((p) => p.variants.some((v) => v.price <= 150000))).toBe(true)
  })

  it('generates brand-first navigation from product data', async () => {
    expect((await getCategories({ brandSlug: 'apple' })).map((c) => c.slug)).toEqual(['mobiltelefon', 'tablet', 'okosora', 'fulhallgato'])
    expect((await getCategories({ brandSlug: 'xiaomi' })).map((c) => c.slug)).toEqual(['mobiltelefon', 'tablet'])
  })

  it('parses shareable listing URLs leniently', () => {
    const query = parseListingParams({ q: ' iphone ', szin: 'e8742a,zzz', tarhely: '256,abc', rendezes: 'price_asc', oldal: '2', ar_max: '-5' })
    expect(query).toMatchObject({ search: 'iphone', colors: ['#E8742A'], storageGb: [256], sort: 'price_asc', page: 2 })
    expect(query.maxPrice).toBeUndefined()
  })

  it('product-level unavailability overrides variant orderability', async () => {
    const tab = await getProductBySlug('galaxy-tab-s10-fe')
    const variant = tab?.variants[0]
    if (!tab || !variant) throw new Error('missing sample')
    expect(variant.orderability).toBe('preorderable')
    expect(effectiveOrderability(tab, variant)).toBe('temporarily_unavailable')
    expect(isVariantOrderable(tab, variant)).toBe(false)
  })
})
