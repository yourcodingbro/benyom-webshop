import { beforeEach, describe, expect, it } from 'vitest'

import { getBrands } from '@/dto/brands'
import { getImportJob } from '@/dto/import-jobs'
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

describe('CSV import (persistent)', () => {
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
    expect(product?.status).toBe('published')
    expect((await getBrands()).map((brand) => brand.slug)).toContain('nothing')
    const again = await importService.applyImport(CSV, ADMIN)
    expect(again.products).toEqual({ created: 0, updated: 0, skipped: 1, failed: 0 })
    expect(again.variants).toEqual({ created: 0, updated: 0, skipped: 3, failed: 0 })
  })

  it('updates only provided fields and never deletes absent records', async () => {
    const before = await getAllProducts(ADMIN)
    const iphone = before.find((item) => item.id === 'prod-iphone-17')
    const report = await importService.applyImport('product_id;sku;price_huf\nprod-iphone-17;APL-IP17-256-01;459990', ADMIN)
    expect(report.variants).toEqual({ created: 0, updated: 1, skipped: 0, failed: 0 })
    const after = await getAllProducts(ADMIN)
    const updated = after.find((item) => item.id === 'prod-iphone-17')
    expect(after).toHaveLength(before.length)
    expect(updated?.variants.find((variant) => variant.sku === 'APL-IP17-256-01')?.price).toBe(459990)
    expect(updated?.variants).toHaveLength(iphone?.variants.length ?? -1)
    expect(updated?.description).toBe(iphone?.description)
    expect(updated?.specifications).toEqual(iphone?.specifications)
    expect(updated?.variants.find((variant) => variant.sku === 'APL-IP17-256-01')?.attributes).toEqual(iphone?.variants.find((variant) => variant.sku === 'APL-IP17-256-01')?.attributes)
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
    expect(report.errors.map((error) => [error.row, error.column])).toEqual(expect.arrayContaining([[2, 'color_hex'], [3, 'sku'], [4, 'image_keys']]))
    expect(report.products).toEqual({ created: 1, updated: 0, skipped: 0, failed: 3 })
    const ids = (await getAllProducts(ADMIN)).map((item) => item.id)
    expect(ids).toContain('prod-jo')
    expect(ids).not.toContain('prod-hibas')
  })

  it('persists jobs: preview, apply, re-run and resume are idempotent', async () => {
    const created = await importService.createJob('teszt.csv', CSV, ADMIN)
    expect(created.status).toBe('previewed')
    expect(created.previewReport?.products.created).toBe(1)
    expect((await getAllProducts(ADMIN)).some((item) => item.id === 'prod-nothing-phone-3')).toBe(false)
    const done = await importService.runJob(created.id, ADMIN)
    expect(done.status).toBe('completed')
    expect(done.finalReport?.products).toEqual({ created: 1, updated: 0, skipped: 0, failed: 0 })
    // Running a completed job again changes nothing.
    expect((await importService.runJob(created.id, ADMIN)).finalReport).toEqual(done.finalReport)
    const stored = await getImportJob(created.id, ADMIN)
    expect(Object.keys(stored?.results ?? {})).toEqual(['prod-nothing-phone-3'])
    // A new job with the same file reports everything as unchanged.
    const second = await importService.runJob((await importService.createJob('teszt.csv', CSV, ADMIN)).id, ADMIN)
    expect(second.finalReport?.products).toEqual({ created: 0, updated: 0, skipped: 1, failed: 0 })
  })

  it('rejects unknown columns, duplicate SKUs in a file and non-admin callers', async () => {
    expect((await importService.previewImport('product_id;sku;ismeretlen\na;B;c', ADMIN)).errors[0]?.message).toMatch(/Ismeretlen oszlop/)
    const duplicate = await importService.previewImport('product_id;sku;price_huf\nprod-iphone-17;APL-IP17-256-01;1\nprod-iphone-17;APL-IP17-256-01;2', ADMIN)
    expect(duplicate.errors.some((error) => /Duplikált/.test(error.message))).toBe(true)
    await expect(importService.previewImport(CSV, { kind: 'anonymous' })).rejects.toThrow()
    await expect(importService.createJob('x.csv', CSV, { kind: 'anonymous' })).rejects.toThrow()
  })
})
