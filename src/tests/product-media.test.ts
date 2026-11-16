import { sql } from '@payloadcms/db-postgres'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reserveProductSlug, slugCandidate } from '@/collections/hooks/slugs'
import { createProductMedia, deleteAbandonedProductMedia } from '@/dto/media'
import { getAllProducts } from '@/dto/products'
import { clock, HOUR_MS } from '@/lib/clock'
import { slugify } from '@/lib/slug'
import type { Product } from '@/payload-types'
import { importService } from '@/services/importService'
import { mediaUploadService, type ProductImageUploadInput } from '@/services/mediaUploadService'
import { ADMIN, adminUser, resetWorld, testPayload } from '@/tests/helpers'

// Tests run without Supabase Storage: the storage write itself is replaced, everything before it is real.
vi.mock('@/dto/media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/dto/media')>()
  return {
    ...actual,
    createProductMedia: vi.fn(async (input: { prefix: string; alt: string }, file: { name: string }) => ({ id: 4242, objectKey: `${input.prefix}/${file.name}`, url: null, filename: file.name, alt: input.alt })),
  }
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const FILE = { data: Buffer.from('kep'), mimetype: 'image/webp', name: 'Előnézet Kép (1).WEBP', size: 3 }
let sku = 0

beforeEach(async () => {
  await resetWorld()
  vi.mocked(createProductMedia).mockClear()
})

async function createProduct(name: string, extra: Record<string, unknown> = {}): Promise<Product> {
  const payload = await testPayload()
  sku += 1
  const data = {
    name,
    model: name,
    brand: 'brand-apple',
    categories: ['cat-mobiltelefon'],
    orderability: 'preorderable',
    variants: [{ sku: `TESZT-${sku}`, price: 1000, orderability: 'preorderable' }],
    ...extra,
  }
  return payload.create({ collection: 'products', data: data as never, user: await adminUser(), overrideAccess: false, draft: true })
}

function upload(overrides: Partial<ProductImageUploadInput> = {}): ReturnType<typeof mediaUploadService.uploadProductImage> {
  const input: ProductImageUploadInput = {
    productId: null,
    name: 'Nothing Phone (3)',
    slug: null,
    brandId: 'brand-apple',
    categoryId: 'cat-mobiltelefon',
    variantColorHex: null,
    isVariantImage: false,
    colorLabel: null,
    ...overrides,
  }
  return mediaUploadService.uploadProductImage(input, FILE, ADMIN)
}

describe('product identity', () => {
  it('slugifies the full name and suffixes within the length limit', () => {
    expect(slugify('Nothing Phone (3)')).toBe('nothing-phone-3')
    expect(slugify('  Árvíztűrő   tükörfúrógép!! ')).toBe('arvizturo-tukorfurogep')
    expect(slugCandidate('nothing-phone-3', 2)).toBe('nothing-phone-3-2')
    expect(slugCandidate('a'.repeat(80), 12)).toHaveLength(80)
  })

  it('assigns a UUID and a unique slug on creation and never changes them afterwards', async () => {
    const first = await createProduct('Nothing Phone (3)')
    expect(first.id).toMatch(UUID)
    expect(first.slug).toBe('nothing-phone-3')
    const second = await createProduct('Nothing Phone (3)')
    expect(second.slug).toBe('nothing-phone-3-2')

    const payload = await testPayload()
    const renamed = await payload.update({ collection: 'products', id: first.id, data: { name: 'Nothing Phone (3) Pro' }, user: await adminUser(), overrideAccess: false, draft: true })
    expect(renamed).toMatchObject({ id: first.id, slug: 'nothing-phone-3' })
    await expect(payload.update({ collection: 'products', id: first.id, data: { id: 'mas-azonosito' } as never, user: await adminUser(), overrideAccess: false })).resolves.toMatchObject({ id: first.id })
  })

  it('gives concurrent creations of the same name distinct slugs', async () => {
    const created = await Promise.all([1, 2, 3, 4].map(() => createProduct('Párhuzamos Termék')))
    expect(new Set(created.map((product) => product.slug)).size).toBe(4)
    expect(created.map((product) => product.slug).sort()).toEqual(['parhuzamos-termek', 'parhuzamos-termek-2', 'parhuzamos-termek-3', 'parhuzamos-termek-4'])
  })

  it('defaults the primary category to the first selected one and keeps it among the categories', async () => {
    const product = await createProduct('Több Kategóriás', { categories: ['cat-tablet', 'cat-mobiltelefon'] })
    expect(product.primaryCategory).toMatchObject({ id: 'cat-tablet' })
    const payload = await testPayload()
    const chosen = await payload.update({ collection: 'products', id: product.id, data: { primaryCategory: 'cat-mobiltelefon' }, user: await adminUser(), overrideAccess: false, draft: true, depth: 0 })
    expect(chosen.primaryCategory).toBe('cat-mobiltelefon')
    const narrowed = await payload.update({ collection: 'products', id: product.id, data: { categories: ['cat-okosora'] }, user: await adminUser(), overrideAccess: false, draft: true, depth: 0 })
    expect(narrowed.primaryCategory).toBe('cat-okosora')
  })

  it('creates brands and categories inline from the name alone (slug and id generated, duplicates suffixed)', async () => {
    const payload = await testPayload()
    const user = await adminUser()
    const brand = await payload.create({ collection: 'brands', data: { name: 'Új Márka' } as never, user, overrideAccess: false })
    expect(brand).toMatchObject({ id: 'brand-uj-marka', slug: 'uj-marka' })
    const again = await payload.create({ collection: 'brands', data: { name: 'Új márka' } as never, user, overrideAccess: false })
    expect(again.slug).toBe('uj-marka-2')
    const category = await payload.create({ collection: 'categories', data: { name: 'Különleges Kiegészítő' } as never, user, overrideAccess: false })
    expect(category).toMatchObject({ id: 'cat-kulonleges-kiegeszito', slug: 'kulonleges-kiegeszito' })
  })
})

describe('product image uploads', () => {
  it('derives the storage path on the server and reserves the slug for an unsaved product', async () => {
    const result = await upload({ isVariantImage: true, variantColorHex: '#1f1f1f', colorLabel: 'Obszidián' })
    expect(result.productSlug).toBe('nothing-phone-3')
    expect(result.objectKey).toMatch(/^apple\/mobiltelefon\/nothing-phone-3\/1f1f1f\/elonezet-kep-1-[0-9a-f]{8}\.webp$/)
    const [input] = vi.mocked(createProductMedia).mock.calls[0] ?? []
    expect(input).toMatchObject({ brandSlug: 'apple', categorySlug: 'mobiltelefon', productSlug: 'nothing-phone-3', colorHex: '#1F1F1F', prefix: 'apple/mobiltelefon/nothing-phone-3/1f1f1f', alt: 'Nothing Phone (3) – Obszidián' })

    // The reservation keeps the slug from other products until this form saves; then the product owns it.
    expect(await reserveProductSlug(await testPayload(), 'Nothing Phone (3)', clock.now())).toBe('nothing-phone-3-2')
    const second = await upload({ slug: 'nothing-phone-3' })
    expect(second.objectKey).toMatch(/^apple\/mobiltelefon\/nothing-phone-3\/elonezet-kep-1-[0-9a-f]{8}\.webp$/)
    const saved = await createProduct('Nothing Phone (3)', { slug: 'nothing-phone-3' })
    expect(saved.slug).toBe('nothing-phone-3')
    const payload = await testPayload()
    expect((await payload.count({ collection: 'product-slug-reservations', where: { slug: { equals: 'nothing-phone-3' } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('uses the stored slug of a saved product and the chosen primary category, never client-sent paths', async () => {
    const product = await createProduct('Galaxy Teszt', { categories: ['cat-tablet', 'cat-mobiltelefon'] })
    const result = await upload({ productId: product.id, name: 'Átnevezve', slug: 'hamis-slug', categoryId: 'cat-mobiltelefon' })
    expect(result.objectKey).toMatch(/^apple\/mobiltelefon\/galaxy-teszt\//)
    await expect(upload({ slug: 'soha-nem-foglalt-de-szabad' })).resolves.toMatchObject({ productSlug: 'soha-nem-foglalt-de-szabad' })
    await expect(upload({ slug: product.slug })).rejects.toMatchObject({ code: 'CONFLICT' })
    // A typed slug is normalized to one safe path segment, never used as a path.
    await expect(upload({ slug: '../../Masik Termek' })).resolves.toMatchObject({ productSlug: 'masik-termek' })
  })

  it('refuses uploads until brand, category and name (and the variant color) are present', async () => {
    await expect(upload({ name: '  ' })).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { name: expect.any(String) } })
    await expect(upload({ brandId: '' })).rejects.toMatchObject({ fieldErrors: { brand: expect.any(String) } })
    await expect(upload({ categoryId: '' })).rejects.toMatchObject({ fieldErrors: { categories: expect.any(String) } })
    await expect(upload({ isVariantImage: true, variantColorHex: '#12' })).rejects.toMatchObject({ fieldErrors: { colorHex: expect.stringMatching(/HEX/) } })
    await expect(upload({ brandId: 'brand-nincs' })).rejects.toMatchObject({ fieldErrors: { brand: expect.any(String) } })
    await expect(mediaUploadService.uploadProductImage({ productId: null, name: 'X', slug: null, brandId: 'brand-apple', categoryId: 'cat-tablet', variantColorHex: null, isVariantImage: false, colorLabel: null }, { ...FILE, mimetype: 'image/svg+xml' }, ADMIN)).rejects.toThrow(/WebP/)
    await expect(mediaUploadService.uploadProductImage({ productId: null, name: 'X', slug: null, brandId: 'brand-apple', categoryId: 'cat-tablet', variantColorHex: null, isVariantImage: false, colorLabel: null }, FILE, { kind: 'anonymous' })).rejects.toThrow()
    expect(createProductMedia).not.toHaveBeenCalled()
  })

  it('closes free-form media creation through the API', async () => {
    const payload = await testPayload()
    await expect(payload.create({ collection: 'media', data: { alt: 'x', brandSlug: 'a', categorySlug: 'b', productSlug: 'c' }, file: FILE, user: await adminUser(), overrideAccess: false })).rejects.toThrow()
  })

  it('cleans up only old, unattached product-form uploads', async () => {
    const payload = await testPayload()
    const old = new Date(clock.now().getTime() - 10 * 24 * HOUR_MS).toISOString()
    const insert = async (key: string, origin: string | null): Promise<number> => {
      const result = await payload.db.drizzle.execute(
        sql`INSERT INTO media (alt, brand_slug, category_slug, product_slug, filename, prefix, object_key, upload_origin, created_at, updated_at) VALUES ('x', 'apple', 'tablet', 'p', ${key}, 'apple/tablet/p', ${'apple/tablet/p/' + key}, ${origin}, ${old}, ${old}) RETURNING id`,
      )
      return Number((result.rows[0] as { id: number }).id)
    }
    const abandoned = await insert('elhagyott.webp', 'product-form')
    const attached = await insert('hasznalt.webp', 'product-form')
    const imported = await insert('importalt.webp', null)
    await createProduct('Kép Hivatkozással', { images: [attached] })
    expect(await deleteAbandonedProductMedia(new Date(clock.now().getTime() - 7 * 24 * HOUR_MS), 20, ADMIN)).toBe(1)
    const remaining = (await payload.find({ collection: 'media', where: { id: { in: [abandoned, attached, imported] } }, overrideAccess: true })).docs.map((doc) => doc.id)
    expect(remaining.sort()).toEqual([attached, imported].sort())
  })
})

describe('CSV import identity', () => {
  it('creates products without product_id under a new UUID and updates them by slug afterwards', async () => {
    const csv = (price: number): string =>
      ['product_id;product_slug;product_name;brand_slug;category_slugs;sku;price_huf', `;;Nothing Phone (3);apple;mobiltelefon;NOT-UUID-01;${price}`].join('\r\n')
    const created = await importService.applyImport(csv(349990), ADMIN)
    expect(created.errors).toEqual([])
    const product = (await getAllProducts(ADMIN)).find((item) => item.slug === 'nothing-phone-3')
    expect(product?.id).toMatch(UUID)
    const updated = await importService.applyImport(csv(359990), ADMIN)
    expect(updated.products).toMatchObject({ created: 0, updated: 1 })
    const after = (await getAllProducts(ADMIN)).find((item) => item.slug === 'nothing-phone-3')
    expect(after).toMatchObject({ id: product?.id, variants: [expect.objectContaining({ price: 359990 })] })
    // Rows with an existing product_id keep it.
    const existing = await importService.applyImport('product_id;sku;price_huf\r\nprod-iphone-17;APL-IP17-256-01;1', ADMIN)
    expect(existing.products.failed).toBe(0)
    expect((await getAllProducts(ADMIN)).some((item) => item.id === 'prod-iphone-17')).toBe(true)
  })
})
