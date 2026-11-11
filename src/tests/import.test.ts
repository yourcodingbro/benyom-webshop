import { beforeEach, describe, expect, it } from 'vitest'

import { getBrands } from '@/dto/brands'
import { getAllProducts } from '@/dto/products'
import { importService } from '@/services/importService'
import { ADMIN, resetWorld } from '@/tests/helpers'

beforeEach(resetWorld)

const HEADER = 'product_id;product_slug;product_name;brand_slug;brand_name;category_slugs;status;sku;color_hex;color_label;storage_gb;price_huf'
const CSV = [
  HEADER,
  'prod-nothing-phone-3;nothing-phone-3;Nothing Phone (3);nothing;Nothing;mobiltelefon;published;NOT-PH3-128-01;#1f1f1f;Obszidián;128;349990',
  'prod-nothing-phone-3;;;;;;;NOT-PH3-256-01;#1F1F1F;;256;389990',
  'prod-nothing-phone-3;;;;;;;NOT-PH3-128-02;#E8E4DA;;128;349990',
].join('\r\n')

describe('CSV import', () => {
  it('dry run reports a plan without changing data', async () => {
    const before = JSON.stringify(await getAllProducts(ADMIN))
    const report = await importService.previewImport(CSV, ADMIN)
    expect(report.errors).toEqual([])
    expect(report.products).toEqual({ created: 1, updated: 0, skipped: 0, failed: 0 })
    expect(report.variants.created).toBe(3)
    expect(report.brandsCreated).toEqual(['nothing'])
    expect(JSON.stringify(await getAllProducts(ADMIN))).toBe(before)
  })

  it('applies, groups rows into variants and is idempotent on re-import', async () => {
    await importService.applyImport(CSV, ADMIN)
    const product = (await getAllProducts(ADMIN)).find((item) => item.id === 'prod-nothing-phone-3')
    expect(product?.variants.map((variant) => variant.sku)).toEqual(['NOT-PH3-128-01', 'NOT-PH3-256-01', 'NOT-PH3-128-02'])
    expect(product?.variants[0]?.attributes.colorHex).toBe('#1F1F1F')
    expect(product?.images[0]?.objectKey).toBe('nothing/mobiltelefon/nothing-phone-3/1f1f1f/elolnezet.svg')
    expect((await getBrands()).map((brand) => brand.slug)).toContain('nothing')

    const again = await importService.applyImport(CSV, ADMIN)
    expect(again.products).toEqual({ created: 0, updated: 0, skipped: 1, failed: 0 })
    expect(again.variants).toEqual({ created: 0, updated: 0, skipped: 3, failed: 0 })
  })

  it('updates only provided fields and never deletes absent records', async () => {
    const before = (await getAllProducts(ADMIN)).find((item) => item.id === 'prod-iphone-17')
    const report = await importService.applyImport('product_id;sku;price_huf\nprod-iphone-17;APL-IP17-256-01;459990', ADMIN)
    expect(report.variants).toEqual({ created: 0, updated: 1, skipped: 0, failed: 0 })
    const after = (await getAllProducts(ADMIN)).find((item) => item.id === 'prod-iphone-17')
    expect(after?.variants.find((variant) => variant.sku === 'APL-IP17-256-01')?.price).toBe(459990)
    expect(after?.variants).toHaveLength(before?.variants.length ?? -1)
    expect(after?.name).toBe(before?.name)
    expect(after?.description).toBe(before?.description)
    expect(after?.variants.find((variant) => variant.sku === 'APL-IP17-256-01')?.attributes).toEqual(before?.variants.find((variant) => variant.sku === 'APL-IP17-256-01')?.attributes)
  })

  it('reports row-level errors for invalid HEX, SKU conflicts and remote images', async () => {
    const csv = [
      'product_id;product_slug;product_name;brand_slug;category_slugs;sku;color_hex;price_huf;image_keys',
      'prod-hibas;hibas;Hibás;apple;mobiltelefon;HIB-1;fekete;1000;',
      'prod-masik;masik;Másik;apple;mobiltelefon;APL-IP17-256-01;#000000;1000;',
      'prod-harmadik;harmadik;Harmadik;apple;mobiltelefon;HAR-1;#000000;1000;https://example.com/kep.jpg',
      'prod-jo;jo;Jó;apple;mobiltelefon;JO-1;#000000;1000;',
    ].join('\n')
    const report = await importService.applyImport(csv, ADMIN)
    expect(report.errors.map((error) => [error.row, error.column])).toEqual(
      expect.arrayContaining([[2, 'color_hex'], [3, 'sku'], [4, 'image_keys']]),
    )
    expect(report.products).toEqual({ created: 1, updated: 0, skipped: 0, failed: 3 })
    expect((await getAllProducts(ADMIN)).some((item) => item.id === 'prod-jo')).toBe(true)
    expect((await getAllProducts(ADMIN)).some((item) => item.id === 'prod-hibas')).toBe(false)
  })

  it('rejects unknown columns, duplicate SKUs in a file and non-admin callers', async () => {
    expect((await importService.previewImport('product_id;sku;ismeretlen\na;B;c', ADMIN)).errors[0]?.message).toMatch(/Ismeretlen oszlop/)
    const duplicate = await importService.previewImport('product_id;sku;price_huf\nprod-iphone-17;APL-IP17-256-01;1\nprod-iphone-17;APL-IP17-256-01;2', ADMIN)
    expect(duplicate.errors.some((error) => /Duplikált/.test(error.message))).toBe(true)
    await expect(importService.previewImport(CSV, { kind: 'anonymous' })).rejects.toThrow()
  })
})
