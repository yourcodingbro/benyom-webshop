import { sql } from '@payloadcms/db-postgres'
import { beforeEach, describe, expect, it } from 'vitest'

import { getBrands, getPopularBrands } from '@/dto/brands'
import { getCategories, getPopularCategories } from '@/dto/categories'
import { getCanonicalSlugForFormer } from '@/dto/products'
import { clock, HOUR_MS } from '@/lib/clock'
import { type SlugSyncState, syncSlug } from '@/lib/slug'
import type { Product } from '@/payload-types'
import { orderService } from '@/services/orderService'
import { ADMIN, adminUser, buildCheckout, resetWorld, testPayload } from '@/tests/helpers'
import type { Order } from '@/types/order'

beforeEach(resetWorld)

const DAY_MS = 24 * HOUR_MS

async function product(id: string): Promise<Product> {
  const payload = await testPayload()
  return payload.findByID({ collection: 'products', id, depth: 0, overrideAccess: true })
}

async function setSlug(id: string, slug: string): Promise<Product> {
  const payload = await testPayload()
  return payload.update({ collection: 'products', id, data: { slug }, user: await adminUser(), overrideAccess: false, depth: 0 })
}

/** A placed order moved to "Átvehető" (personal pickup), ready for the handover actions. */
async function readyOrder(lines: { sku: string; quantity: number }[]): Promise<Order> {
  const checkout = await buildCheckout(lines.map((line) => line.sku))
  const placed = await orderService.placeOrder({ ...checkout, lines: lines.map((line) => ({ ...line, quoteToken: null })) })
  if (!placed.ok) throw new Error(placed.message)
  let order = await orderService.updateFulfillmentStatus({ reference: placed.reference, status: 'confirmed', expectedVersion: 1 }, ADMIN)
  order = await orderService.updateFulfillmentStatus({ reference: order.reference, status: 'procurement_in_progress', expectedVersion: order.version }, ADMIN)
  return orderService.updateFulfillmentStatus({ reference: order.reference, status: 'ready_for_collection', expectedVersion: order.version }, ADMIN)
}

const completeSale = (order: Order): Promise<Order> => orderService.recordHandover({ orderId: order.id, receipt: true, payment: true, complete: true, expectedVersion: order.version }, ADMIN)

async function saleEntries(orderId: string): Promise<{ dimension: string; key: string; quantity: number }[]> {
  const payload = await testPayload()
  const result = await payload.find({ collection: 'sale-entries', where: { order: { equals: Number(orderId) } }, pagination: false, overrideAccess: true, sort: 'entryKey' })
  return result.docs.map((doc) => ({ dimension: doc.dimension, key: doc.key, quantity: Number(doc.quantity) }))
}

describe('product id and editable slug', () => {
  it('hides the id in the admin and keeps it immutable', async () => {
    const payload = await testPayload()
    const idField = payload.config.collections.find((collection) => collection.slug === 'products')?.fields.find((field) => 'name' in field && field.name === 'id')
    expect(idField?.admin && 'readOnly' in idField.admin ? idField.admin.readOnly : null).toBe(true)
    const updated = await payload.update({ collection: 'products', id: 'prod-iphone-17', data: { id: 'mas' } as never, user: await adminUser(), overrideAccess: false, depth: 0 })
    expect(updated.id).toBe('prod-iphone-17')
  })

  it('normalizes an edited slug, redirects former slugs straight to the current one and keeps media keys', async () => {
    const before = await product('prod-iphone-17')
    const mediaBefore = JSON.stringify(before.images)
    expect((await setSlug('prod-iphone-17', '  iPhone 17 – Új Cím ')).slug).toBe('iphone-17-uj-cim')
    expect(await getCanonicalSlugForFormer(before.slug)).toBe('iphone-17-uj-cim')
    await setSlug('prod-iphone-17', 'iphone-17-harmadik')
    // No chain: both former slugs point at the product's current slug.
    expect(await getCanonicalSlugForFormer(before.slug)).toBe('iphone-17-harmadik')
    expect(await getCanonicalSlugForFormer('iphone-17-uj-cim')).toBe('iphone-17-harmadik')
    // Taking a former slug back removes it from the history (no loop).
    await setSlug('prod-iphone-17', before.slug)
    expect(await getCanonicalSlugForFormer(before.slug)).toBeNull()
    expect(await getCanonicalSlugForFormer('iphone-17-harmadik')).toBe(before.slug)
    expect(JSON.stringify((await product('prod-iphone-17')).images)).toBe(mediaBefore)
    // Renaming never changes the slug.
    const payload = await testPayload()
    const renamed = await payload.update({ collection: 'products', id: 'prod-iphone-17', data: { name: 'Teljesen más név' }, user: await adminUser(), overrideAccess: false, depth: 0 })
    expect(renamed.slug).toBe(before.slug)
  })

  it('rejects a slug used by another product, now or formerly, instead of changing it', async () => {
    const other = await product('prod-iphone-17')
    const mine = (await testPayload()).find({ collection: 'products', where: { id: { not_equals: 'prod-iphone-17' } }, limit: 1, depth: 0, overrideAccess: true })
    const target = (await mine).docs[0]
    if (!target) throw new Error('no second product')
    await expect(setSlug(target.id, other.slug)).rejects.toMatchObject({ data: { errors: [expect.objectContaining({ path: 'slug', message: expect.stringMatching(/másik termékhez tartozik/) })] } })
    await setSlug('prod-iphone-17', 'iphone-17-uj')
    await expect(setSlug(target.id, other.slug)).rejects.toMatchObject({ data: { errors: [expect.objectContaining({ message: expect.stringMatching(/korábbi címe/) })] } })
    expect((await product(target.id)).slug).toBe(target.slug)
    await expect(setSlug(target.id, '!!!')).rejects.toThrow()
    // Generated slugs skip former slugs too.
    const payload = await testPayload()
    const created = await payload.create({
      collection: 'products',
      data: { name: other.slug.replace(/-/g, ' '), model: 'X', brand: 'brand-apple', categories: ['cat-mobiltelefon'], orderability: 'preorderable', variants: [{ sku: 'SLUG-TESZT-1', price: 1, orderability: 'preorderable' }] } as never,
      user: await adminUser(),
      overrideAccess: false,
      draft: true,
    })
    expect(created.slug).toBe(`${other.slug}-2`)
  })
})

describe('manual brand and category order', () => {
  it('uses the drag-and-drop order (ties by id) and is only available on the brand/category lists', async () => {
    const payload = await testPayload()
    const brands = await getBrands()
    const last = brands.at(-1)
    if (!last) throw new Error('no brands')
    // What the native reorder endpoint does: give the moved row a key before the first one.
    await payload.update({ collection: 'brands', id: last.id, data: { _order: 'Zz' } as never, overrideAccess: true })
    expect((await getBrands())[0]?.id).toBe(last.id)
    const collections = new Map(payload.config.collections.map((collection) => [collection.slug, collection]))
    expect(collections.get('brands')?.orderable).toBe(true)
    expect(collections.get('categories')?.orderable).toBe(true)
    expect(collections.get('products')?.orderable).not.toBe(true)
    const relations = collections.get('products')?.fields.filter((field) => 'name' in field && ['brand', 'categories', 'primaryCategory'].includes(field.name)) ?? []
    expect(relations.every((field) => !('orderable' in field) || field.orderable !== true)).toBe(true)
    expect((await getCategories()).length).toBeGreaterThan(0)
  })
})

describe('weekly sales popularity', () => {
  it('defaults to manual order and counts only received, paid, completed sales (by quantity, once)', async () => {
    const manualBrands = (await getBrands()).slice(0, 3).map((brand) => brand.id)
    expect((await getPopularBrands(3)).map((brand) => brand.id)).toEqual(manualBrands)
    const manualCategories = (await getCategories()).slice(0, 3).map((category) => category.id)
    expect((await getPopularCategories(3)).map((category) => category.id)).toEqual(manualCategories)

    const order = await readyOrder([{ sku: 'GOO-PW4-41MM-01', quantity: 3 }])
    // Payment alone, receipt alone or a generic status change are not sales.
    await expect(orderService.updateFulfillmentStatus({ reference: order.reference, status: 'completed', expectedVersion: order.version }, ADMIN)).rejects.toThrow(/átvételt és a fizetést/)
    const paid = await orderService.recordHandover({ orderId: order.id, receipt: false, payment: true, complete: false, expectedVersion: order.version }, ADMIN)
    expect(paid.handover).toMatchObject({ paidAt: expect.any(String), saleRecordedAt: null })
    const payload = await testPayload()
    await expect(payload.update({ collection: 'orders', id: Number(order.id), data: { fulfillmentStatus: 'completed', version: paid.version }, user: await adminUser(), overrideAccess: false })).rejects.toThrow(/átvette/)
    expect(await saleEntries(order.id)).toEqual([])

    const done = await completeSale(paid)
    expect(done.fulfillmentStatus).toBe('completed')
    expect(done.handover.saleRecordedAt).toBe(clock.nowIso())
    expect(await saleEntries(order.id)).toEqual([
      { dimension: 'brand', key: 'brand-google', quantity: 3 },
      { dimension: 'category', key: expect.any(String), quantity: 3 },
    ])
    // Repeating the completion (double click, retry, admin form) never counts again.
    await completeSale(done)
    await expect(payload.update({ collection: 'orders', id: Number(order.id), data: { paymentStatus: 'unpaid', version: done.version }, user: await adminUser(), overrideAccess: false })).rejects.toThrow(/nem módosíthatók/)
    expect(await saleEntries(order.id)).toHaveLength(2)
    expect((await getPopularBrands(3))[0]?.id).toBe('brand-google')
  })

  it('ranks by units in the rolling seven days with manual order as tie-breaker, excluding demo orders', async () => {
    const manual = (await getBrands()).map((brand) => brand.id)
    // Demo orders are historical "completed" orders but never produce sales.
    const payload = await testPayload()
    expect((await payload.count({ collection: 'sale-entries', overrideAccess: true })).totalDocs).toBe(0)

    await completeSale(await readyOrder([{ sku: 'SAM-A57-128-01', quantity: 1 }]))
    await completeSale(await readyOrder([{ sku: 'XIA-15T-256-01', quantity: 1 }]))
    // One unit each: equal sales keep the manual order among them, ahead of brands without sales.
    const tied = ['brand-samsung', 'brand-xiaomi'].sort((a, b) => manual.indexOf(a) - manual.indexOf(b))
    expect((await getPopularBrands(2)).map((brand) => brand.id)).toEqual(tied)

    clock.advance(DAY_MS)
    await completeSale(await readyOrder([{ sku: 'XIA-15T-256-01', quantity: 2 }]))
    expect((await getPopularBrands(2)).map((brand) => brand.id)).toEqual(['brand-xiaomi', 'brand-samsung'])

    // Exactly seven days after the first two sales they leave the window; the later one still counts.
    clock.advance(6 * DAY_MS)
    expect((await getPopularBrands(2)).map((brand) => brand.id)[0]).toBe('brand-xiaomi')
    clock.advance(DAY_MS - 1)
    expect((await getPopularBrands(1)).map((brand) => brand.id)).toEqual(['brand-xiaomi'])
    clock.advance(1)
    expect((await getPopularBrands(3)).map((brand) => brand.id)).toEqual(manual.slice(0, 3))
  })

  it('counts a multi-category product once in each of its categories, from the attribution fixed at checkout', async () => {
    const payload = await testPayload()
    const target = (await payload.find({ collection: 'products', where: { 'variants.sku': { equals: 'GOO-PW4-41MM-01' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    if (!target) throw new Error('missing product')
    await payload.update({ collection: 'products', id: target.id, data: { categories: ['cat-okosora', 'cat-tablet'] }, overrideAccess: true })
    const order = await readyOrder([{ sku: 'GOO-PW4-41MM-01', quantity: 2 }])
    // A later product edit does not rewrite the recorded attribution.
    await payload.update({ collection: 'products', id: target.id, data: { categories: ['cat-mobiltelefon'] }, overrideAccess: true })
    await completeSale(order)
    expect((await saleEntries(order.id)).filter((entry) => entry.dimension === 'category')).toEqual([
      { dimension: 'category', key: 'cat-okosora', quantity: 2 },
      { dimension: 'category', key: 'cat-tablet', quantity: 2 },
    ])
    expect((await getPopularCategories(2)).map((category) => category.id).sort()).toEqual(['cat-okosora', 'cat-tablet'])
  })
})

describe('live slug in the product create form', () => {
  it('follows the name until edited by hand, then keeps the typed slug', () => {
    let state: SlugSyncState = { lastGenerated: null, previousValue: '' }
    let value = ''
    const step = (name: string, following: boolean): ReturnType<typeof syncSlug> => {
      const result = syncSlug(state, value, name, following)
      state = result.state
      if (result.setValue !== null) value = result.setValue
      return result
    }
    step('Nothing', true)
    expect(value).toBe('nothing')
    step('Nothing Phone (3)', true)
    expect(value).toBe('nothing-phone-3')
    // The form re-renders with the value it just received: nothing changes.
    expect(step('Nothing Phone (3)', true)).toMatchObject({ setValue: null, stopFollowing: false })
    value = 'sajat-cim'
    expect(step('Nothing Phone (3)', true).stopFollowing).toBe(true)
    // No longer following: renaming keeps the typed slug.
    step('Nothing Phone (3) Pro', false)
    expect(value).toBe('sajat-cim')
  })

  it('gives a taken generated slug a suffix but rejects a taken hand-chosen one; the flag is never stored', async () => {
    const payload = await testPayload()
    const taken = (await product('prod-iphone-17')).slug
    const data = (slug: string, slugAuto: boolean, sku: string): never =>
      ({ name: 'iPhone 17', slug, slugAuto, model: 'X', brand: 'brand-apple', categories: ['cat-mobiltelefon'], orderability: 'preorderable', variants: [{ sku, price: 1, orderability: 'preorderable' }] }) as never
    const generated = await payload.create({ collection: 'products', data: data(taken, true, 'LIVE-SLUG-1'), user: await adminUser(), overrideAccess: false, draft: true })
    expect(generated.slug).toBe(`${taken}-2`)
    const columns = await payload.db.drizzle.execute(sql`select column_name from information_schema.columns where table_name in ('products', '_products_v') and column_name like '%slug_auto%'`)
    expect(columns.rows).toEqual([])
    await expect(payload.create({ collection: 'products', data: data(taken, false, 'LIVE-SLUG-2'), user: await adminUser(), overrideAccess: false, draft: true })).rejects.toMatchObject({
      data: { errors: [expect.objectContaining({ path: 'slug', message: expect.stringMatching(/másik termékhez tartozik/) })] },
    })
    // Saved products never take the suffix route: an edited duplicate is always an error.
    await expect(payload.update({ collection: 'products', id: generated.id, data: { slug: taken, slugAuto: true } as never, user: await adminUser(), overrideAccess: false })).rejects.toMatchObject({
      data: { errors: [expect.objectContaining({ path: 'slug' })] },
    })
  })

  it('shows the UUID read-only in the edit view only (not on create, not as a list column)', async () => {
    const payload = await testPayload()
    const products = payload.config.collections.find((collection) => collection.slug === 'products')
    const idField = products?.fields.find((field) => 'name' in field && field.name === 'id')
    expect(products?.admin.defaultColumns).not.toContain('id')
    expect(idField?.admin).toMatchObject({ readOnly: true, disableBulkEdit: true, disableListColumn: true, components: { Field: '@/components/admin/EditViewOnlyField#EditViewOnlyField' } })
  })
})
