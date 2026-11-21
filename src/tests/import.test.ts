import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'


import { getBrands } from '@/dto/brands'
import { getImportJob } from '@/dto/import-jobs'
import { getAllProducts } from '@/dto/products'
import { importService } from '@/services/importService'
import { ADMIN, adminUser, resetWorld, testPayload } from '@/tests/helpers'
import type { SpecificationGroup } from '@/types/catalog'

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

  it('creates jobs only through the dry run, never from a form save or API create', async () => {
    const payload = await testPayload()
    await expect(payload.create({ collection: 'import-jobs', data: { fileName: 'x.csv', csv: CSV, status: 'previewed' }, user: await adminUser(), overrideAccess: false })).rejects.toThrow(/próbafuttatással/)
    // A dry run creates the record but applies nothing until the explicit run.
    const job = await importService.createJob('teszt.csv', CSV, ADMIN)
    expect(job.status).toBe('previewed')
    expect((await getAllProducts(ADMIN)).some((item) => item.id === 'prod-nothing-phone-3')).toBe(false)
    expect(await importService.getJob(job.id, ADMIN)).toMatchObject({ id: job.id, status: 'previewed', fileName: 'teszt.csv' })
  })

  it('retries a failed job safely: groups finished before the failure are not applied again', async () => {
    const job = await importService.createJob('teszt.csv', CSV, ADMIN)
    const done = await importService.runJob(job.id, ADMIN)
    expect(done.status).toBe('completed')
    // Simulate a run that failed after this group was recorded.
    const payload = await testPayload()
    await payload.update({ collection: 'import-jobs', id: job.id, data: { status: 'failed', error: 'megszakadt', finalReport: null }, overrideAccess: true })
    const retried = await importService.runJob(job.id, ADMIN)
    expect(retried).toMatchObject({ status: 'completed', error: null, processedGroups: 1 })
    expect(retried.finalReport?.products).toEqual(done.finalReport?.products)
    expect((await getAllProducts(ADMIN)).filter((item) => item.id === 'prod-nothing-phone-3')).toHaveLength(1)
  })

  it('rejects unknown columns, duplicate SKUs in a file and non-admin callers', async () => {
    expect((await importService.previewImport('product_id;sku;ismeretlen\na;B;c', ADMIN)).errors[0]?.message).toMatch(/Ismeretlen oszlop/)
    const duplicate = await importService.previewImport('product_id;sku;price_huf\nprod-iphone-17;APL-IP17-256-01;1\nprod-iphone-17;APL-IP17-256-01;2', ADMIN)
    expect(duplicate.errors.some((error) => /Duplikált/.test(error.message))).toBe(true)
    await expect(importService.previewImport(CSV, { kind: 'anonymous' })).rejects.toThrow()
    await expect(importService.createJob('x.csv', CSV, { kind: 'anonymous' })).rejects.toThrow()
  })
})

/** A CSV cell holding JSON: wrapped in double quotes, every inner quote doubled (RFC 4180). */
const jsonCell = (value: unknown): string => `"${JSON.stringify(value).replace(/"/g, '""')}"`
const SPEC_HEADER = 'product_id;product_slug;product_name;brand_slug;category_slugs;sku;price_huf;specifications'
const KIJELZO = { title: 'Kijelző', items: [{ label: 'Méret', value: '6,1 hüvelyk' }, { label: 'Frissítés', value: '120 Hz' }] }
const AKKU = { title: 'Akkumulátor', items: [{ label: 'Kapacitás', value: '4000 mAh' }] }
const specsOf = async (id: string): Promise<SpecificationGroup[] | undefined> => (await getAllProducts(ADMIN)).find((item) => item.id === id)?.specifications

describe('CSV import: product specifications', () => {
  it('imports the downloadable sample with its Hungarian specifications, shows them first, and never duplicates on re-import', async () => {
    const sample = readFileSync(path.resolve('public/minta/termekimport-minta.csv'), 'utf8')
    const preview = await importService.previewImport(sample, ADMIN)
    expect(preview.errors).toEqual([])
    const change = preview.specificationChanges?.find((item) => item.productId === 'prod-nothing-phone-3')
    expect(change).toMatchObject({ row: 2, change: 'replace', productName: 'Nothing Phone (3)', updated: [], removed: [] })
    expect(change?.added).toContain('Kijelző › Méret: 6,67 hüvelyk')
    expect(change?.added).toContain('Általános › Vízállóság: IP68 – por- és vízálló')
    // The iPhone row leaves its specifications cell blank: nothing planned for it.
    expect(preview.specificationChanges?.some((item) => item.productId === 'prod-iphone-17')).toBe(false)

    const iphoneBefore = await specsOf('prod-iphone-17')
    await importService.applyImport(sample, ADMIN)
    const specs = await specsOf('prod-nothing-phone-3')
    expect(specs?.map((group) => group.title)).toEqual(['Kijelző', 'Akkumulátor', 'Általános'])
    expect(specs?.[0]?.items).toEqual([{ label: 'Méret', value: '6,67 hüvelyk' }, { label: 'Típus', value: 'LTPO AMOLED, 120 Hz' }])
    expect(await specsOf('prod-iphone-17')).toEqual(iphoneBefore)

    // Stored as Payload rows, i.e. what the admin "Specifikáció" field edits.
    const payload = await testPayload()
    const doc = await payload.findByID({ collection: 'products', id: 'prod-nothing-phone-3', overrideAccess: true, depth: 0 })
    expect(doc.specifications?.[2]).toMatchObject({ title: 'Általános', items: [{ label: 'Operációs rendszer', value: 'Nothing OS (Android-alapú)' }, { label: 'Vízállóság' }] })

    const again = await importService.applyImport(sample, ADMIN)
    expect(again.specificationChanges).toEqual([])
    expect(again.products.created + again.products.updated).toBe(0)
    expect((await specsOf('prod-nothing-phone-3'))?.flatMap((group) => group.items)).toHaveLength(6)
  })

  it('keeps stored specifications for blank cells, replaces them with a new list, and clears them with []', async () => {
    const original = await specsOf('prod-iphone-17')
    expect(original?.length).toBeGreaterThan(0)
    await importService.applyImport(`${SPEC_HEADER}\nprod-iphone-17;;;;;APL-IP17-256-01;459990;`, ADMIN)
    expect(await specsOf('prod-iphone-17')).toEqual(original)

    const next = [{ ...KIJELZO, items: [{ label: 'Méret', value: '6,3 hüvelyk' }, { label: 'Fényerő', value: '3000 nit' }] }, AKKU]
    const before = (original ?? []).find((group) => group.title === 'Kijelző')
    const preview = await importService.previewImport(`${SPEC_HEADER}\nprod-iphone-17;;;;;APL-IP17-256-01;;${jsonCell(next)}`, ADMIN)
    const change = preview.specificationChanges?.[0]
    expect(change?.change).toBe('replace')
    expect(change?.added).toEqual(expect.arrayContaining(['Kijelző › Fényerő: 3000 nit', 'Akkumulátor › Kapacitás: 4000 mAh']))
    if (before?.items.some((item) => item.label === 'Méret')) expect(change?.updated.some((entry) => entry.startsWith('Kijelző › Méret:') && entry.endsWith('→ 6,3 hüvelyk'))).toBe(true)
    await importService.applyImport(`${SPEC_HEADER}\nprod-iphone-17;;;;;APL-IP17-256-01;;${jsonCell(next)}`, ADMIN)
    expect(await specsOf('prod-iphone-17')).toEqual(next)

    const clear = await importService.previewImport(`${SPEC_HEADER}\nprod-iphone-17;;;;;APL-IP17-256-01;;[]`, ADMIN)
    expect(clear.specificationChanges?.[0]).toMatchObject({ change: 'clear', removed: expect.arrayContaining(['Akkumulátor › Kapacitás']) })
    await importService.applyImport(`${SPEC_HEADER}\nprod-iphone-17;;;;;APL-IP17-256-01;;[]`, ADMIN)
    expect(await specsOf('prod-iphone-17')).toEqual([])
  })

  it('takes specifications from the main row of a multi-row product and rejects a conflicting second value', async () => {
    const ok = [
      SPEC_HEADER,
      `prod-spec-teszt;spec-teszt;Spec teszt;apple;mobiltelefon;SPC-1;1000;${jsonCell([KIJELZO])}`,
      'prod-spec-teszt;;;;;SPC-2;1100;',
      `prod-spec-teszt;;;;;SPC-3;1200;${jsonCell([KIJELZO])}`,
    ].join('\r\n')
    expect((await importService.previewImport(ok, ADMIN)).errors).toEqual([])

    const conflicting = [SPEC_HEADER, ok.split('\r\n')[1], 'prod-spec-teszt;;;;;SPC-2;1100;', `prod-spec-teszt;;;;;SPC-3;1200;${jsonCell([AKKU])}`].join('\r\n')
    const report = await importService.applyImport(conflicting, ADMIN)
    expect(report.errors).toContainEqual(expect.objectContaining({ row: 4, column: 'specifications', message: expect.stringMatching(/Ellentmondó/) }))
    expect(report.products.failed).toBe(1)
    expect((await getAllProducts(ADMIN)).some((item) => item.id === 'prod-spec-teszt')).toBe(false)
  })

  it('reports invalid specification cells per row and column with the location of the problem', async () => {
    const rows: [string, RegExp][] = [
      ['[{title:"Kijelző"}]', /Érvénytelen JSON/],
      [jsonCell({ title: 'Kijelző', items: [] }), /JSON-tömb szükséges/],
      [jsonCell([{ title: 'Kijelző', items: [{ label: 'Méret', value: '' }] }]), /1\. csoport, 1\. tulajdonság: value: nem lehet üres/],
      [jsonCell([{ title: 'Kijelző', items: [{ label: 'Méret', value: '6,1', unit: 'col' }] }]), /1\. csoport, 1\. tulajdonság/],
      [jsonCell([KIJELZO, { ...AKKU, title: 'Kijelző' }]), /Ismétlődő csoport: „Kijelző”/],
      [jsonCell([{ title: 'Kijelző', items: [{ label: 'Méret', value: '1' }, { label: 'Méret', value: '2' }] }]), /Ismétlődő tulajdonság/],
    ]
    for (const [cell, message] of rows) {
      const report = await importService.previewImport(`${SPEC_HEADER}\nprod-iphone-17;;;;;APL-IP17-256-01;;${cell}`, ADMIN)
      expect(report.errors, cell).toContainEqual(expect.objectContaining({ row: 2, column: 'specifications', message: expect.stringMatching(message) }))
      expect(report.products.failed).toBe(1)
    }
  })
})
