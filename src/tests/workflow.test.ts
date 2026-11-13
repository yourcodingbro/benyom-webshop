import { sql } from '@payloadcms/db-postgres'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { areDevToolsEnabled } from '@/config/runtime'
import { getOrder } from '@/dto/orders'
import { SCHEDULER_AUTH } from '@/lib/authorization'
import { HOUR_MS, clock } from '@/lib/clock'
import { proxy } from '@/proxy'
import { describeError, runInitialImport } from '@/seed/initial-import'
import { emailService } from '@/services/emailService'
import { orderService } from '@/services/orderService'
import { priceChangeService } from '@/services/priceChangeService'
import { ADMIN, adminUser, placeTestOrder, reload, resetWorld, testPayload } from '@/tests/helpers'

beforeEach(async () => {
  await resetWorld()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

async function emailCount(reference: string, templateId: string): Promise<number> {
  const payload = await testPayload()
  return (await payload.count({ collection: 'email-messages', where: { and: [{ orderReference: { equals: reference } }, { templateId: { equals: templateId } }] }, overrideAccess: true })).totalDocs
}

describe('persistence and authorization through Payload', () => {
  it('denies orders, proposals, audit and email data to anonymous API access', async () => {
    const payload = await testPayload()
    for (const collection of ['orders', 'order-events', 'price-change-proposals', 'email-messages', 'import-jobs', 'contact-messages'] as const) {
      await expect(payload.find({ collection, overrideAccess: false })).rejects.toThrow()
    }
    await expect(payload.findGlobal({ slug: 'notification-settings', overrideAccess: false })).rejects.toThrow()
    // Even admins cannot create orders, audit entries, proposals or emails through the API.
    const user = await adminUser()
    await expect(payload.create({ collection: 'order-events', data: { order: 1, orderReference: 'X', type: 'admin_edit', actorType: 'admin', actorLabel: 'x', message: 'x', at: clock.nowIso() }, user, overrideAccess: false })).rejects.toThrow()
    await expect(payload.create({ collection: 'email-messages', data: { idempotencyKey: 'x', templateId: 'order-received', category: 'customer', to: 'a@b.hu', status: 'queued' }, user, overrideAccess: false })).rejects.toThrow()
  })
})

describe('order audit trail', () => {
  it('records creation, status changes and cancellation with server-side actors, in order', async () => {
    const order = await placeTestOrder()
    const confirmed = await orderService.updateFulfillmentStatus({ reference: order.reference, status: 'confirmed', expectedVersion: order.version }, { kind: 'admin', adminId: '1', label: 'admin@teszt.hu' })
    await expect(orderService.cancelOrder({ reference: order.reference, note: '', expectedVersion: confirmed.version }, ADMIN)).rejects.toThrow(/indoklása kötelező/)
    await orderService.cancelOrder({ reference: order.reference, note: 'Az ügyfél telefonon lemondta.', expectedVersion: confirmed.version }, ADMIN)
    const latest = await reload(order)
    const types = latest.events.map((event) => event.type).filter((type) => !type.startsWith('notification_'))
    expect(types.slice(0, 2)).toEqual(['submitted', 'status_changed'])
    expect(types).toContain('cancelled')
    const status = latest.events.find((event) => event.type === 'status_changed')
    expect(status).toMatchObject({ actor: 'admin', actorLabel: 'admin@teszt.hu', previousValue: 'received', newValue: 'confirmed' })
    expect(latest.events.find((event) => event.type === 'cancelled')?.reason).toBe('Az ügyfél telefonon lemondta.')
    const times = latest.events.map((event) => event.at)
    expect([...times].sort()).toEqual(times)
  })

  it('admin edits through the API are validated and audited with the signed-in admin', async () => {
    const order = await placeTestOrder()
    const payload = await testPayload()
    const user = await adminUser()
    const doc = (await payload.find({ collection: 'orders', where: { reference: { equals: order.reference } }, overrideAccess: true })).docs[0]
    if (!doc) throw new Error('missing')
    await expect(payload.update({ collection: 'orders', id: doc.id, data: { fulfillmentStatus: 'completed' }, user, overrideAccess: false })).rejects.toThrow(/Nem engedélyezett/)
    await expect(payload.update({ collection: 'orders', id: doc.id, data: { fulfillmentStatus: 'cancelled' }, user, overrideAccess: false })).rejects.toThrow(/Rendelés törlése/)
    await expect(payload.update({ collection: 'orders', id: doc.id, data: { priceApprovalStatus: 'accepted' }, user, overrideAccess: false })).rejects.toThrow(/nem módosítható/)
    await expect(payload.update({ collection: 'orders', id: doc.id, data: { submission: {} }, user, overrideAccess: false })).rejects.toThrow()
    await payload.update({ collection: 'orders', id: doc.id, data: { fulfillmentStatus: 'confirmed', version: doc.version }, user, overrideAccess: false })
    // A stale form (old version) is rejected instead of overwriting the newer state.
    await expect(payload.update({ collection: 'orders', id: doc.id, data: { paymentStatus: 'paid', version: doc.version }, user, overrideAccess: false })).rejects.toThrow(/időközben/)
    const latest = await reload(order)
    expect(latest.events.find((event) => event.type === 'status_changed')).toMatchObject({ actor: 'admin', actorLabel: 'admin@teszt.hu' })
  })

  it('history cannot be rewritten, even with full access', async () => {
    const order = await placeTestOrder()
    const payload = await testPayload()
    const event = (await payload.find({ collection: 'order-events', where: { orderReference: { equals: order.reference } }, overrideAccess: true })).docs[0]
    if (!event) throw new Error('missing event')
    await expect(payload.update({ collection: 'order-events', id: event.id, data: { message: 'átírva' }, overrideAccess: true })).rejects.toThrow()
    await expect(payload.delete({ collection: 'order-events', id: event.id, overrideAccess: true })).rejects.toThrow()
  })
})

describe('per-status notification switches', () => {
  it('applies the policy centrally: disabled transitions are skipped with a reason, no re-sends', async () => {
    const payload = await testPayload()
    await payload.updateGlobal({ slug: 'notification-settings', data: { statusEmails: { confirmed: false, procurement_in_progress: true } }, overrideAccess: true })
    const order = await placeTestOrder()
    const confirmed = await orderService.updateFulfillmentStatus({ reference: order.reference, status: 'confirmed', expectedVersion: order.version }, ADMIN)
    const skipped = (await payload.find({ collection: 'email-messages', where: { and: [{ orderReference: { equals: order.reference } }, { templateId: { equals: 'fulfillment-update' } }] }, overrideAccess: true })).docs
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ status: 'skipped', skipReason: expect.stringMatching(/ki van kapcsolva/) })
    expect((await reload(order)).events.map((event) => event.type)).toContain('notification_skipped')

    await orderService.updateFulfillmentStatus({ reference: order.reference, status: 'procurement_in_progress', expectedVersion: confirmed.version }, ADMIN)
    expect(await emailCount(order.reference, 'fulfillment-update')).toBe(2)
    // Turning "confirmed" on later does not resend the past notification.
    await payload.updateGlobal({ slug: 'notification-settings', data: { statusEmails: { confirmed: true } }, overrideAccess: true })
    expect(await emailCount(order.reference, 'fulfillment-update')).toBe(2)
    // Saving without a status transition sends nothing.
    const user = await adminUser()
    const doc = (await payload.find({ collection: 'orders', where: { reference: { equals: order.reference } }, overrideAccess: true })).docs[0]
    if (!doc) throw new Error('missing')
    await payload.update({ collection: 'orders', id: doc.id, data: { needsPriceReview: true, version: doc.version }, user, overrideAccess: false })
    expect(await emailCount(order.reference, 'fulfillment-update')).toBe(2)
  })
})

describe('initial import and demo data', () => {
  it('keeps the media schema independent of storage configuration (adapter fields, per-prefix filenames)', async () => {
    // Tests run without SUPABASE_* (no S3 plugin): the migrated table must still match, with the adapter columns.
    const payload = await testPayload()
    await expect(payload.find({ collection: 'media', where: { objectKey: { equals: 'apple/mobiltelefon/iphone-17/1c1c1e/elolnezet.webp' } }, limit: 1, overrideAccess: true })).resolves.toBeTruthy()
    const media = payload.config.collections.find((collection) => collection.slug === 'media')
    expect(media?.fields.map((field) => ('name' in field ? field.name : null))).toEqual(expect.arrayContaining(['prefix', '_objectKey']))
    expect(typeof media?.upload === 'object' ? media.upload.filenameCompoundIndex : null).toEqual(['filename', 'prefix'])
  })

  it('summarizes the database error chain without SQL text, parameters or connection strings', () => {
    const error = new Error('Failed query: select "prefix" from "media"\nparams: titok', { cause: Object.assign(new Error('column "prefix" does not exist'), { code: '42703' }) })
    expect(describeError(error)).toBe('Failed query (SQL omitted) ← column "prefix" does not exist code=42703')
    expect(describeError(new Error('connect failed postgresql://user:pass@host/db'))).not.toContain('pass')
  })

  it('is idempotent, maps ids by slug and never overwrites', async () => {
    const payload = await testPayload()
    const rerun = await runInitialImport(payload, { skipDemo: false, storageReady: false })
    expect(rerun.counts.products).toMatchObject({ created: 0, failed: 0 })
    expect(rerun.counts.products.skipped).toBe(30)
    expect(rerun.counts.demoOrders).toMatchObject({ created: 0, skipped: 2 })
    expect(rerun.counts.media.created).toBe(0)

    // A brand that already exists under another id (same slug) is mapped to it, never duplicated or overwritten.
    await payload.db.drizzle.execute(
      sql.raw(
        [
          'SET session_replication_role = replica',
          "UPDATE brands SET id = 'brand-google-kezi' WHERE id = 'brand-google'",
          "UPDATE products SET brand_id = 'brand-google-kezi' WHERE brand_id = 'brand-google'",
          "UPDATE _products_v SET version_brand_id = 'brand-google-kezi' WHERE version_brand_id = 'brand-google'",
          'SET session_replication_role = origin',
        ].join(';\n'),
      ),
    )
    const mapped = await runInitialImport(payload, { skipDemo: true, storageReady: false })
    expect(mapped.counts.brands.mapped).toBe(1)
    expect(mapped.counts.brands.created).toBe(0)
    expect((await payload.count({ collection: 'brands', where: { slug: { equals: 'google' } }, overrideAccess: true })).totalDocs).toBe(1)
  })

  it('imports demo orders without emails or jobs and keeps them out of all processing', async () => {
    const payload = await testPayload()
    expect((await payload.count({ collection: 'email-messages', overrideAccess: true })).totalDocs).toBe(0)
    const demo = await getOrder('BNY-MNTA-0002', ADMIN)
    expect(demo?.isDemo).toBe(true)
    expect(demo?.events.map((event) => event.type)).toContain('imported')
    await expect(orderService.updateFulfillmentStatus({ reference: 'BNY-MNTA-0002', status: 'confirmed', expectedVersion: demo?.version ?? 0 }, ADMIN)).rejects.toThrow(/Demó/)
    // Even a demo job that somehow exists is cancelled instead of sent.
    const job = await payload.create({ collection: 'email-messages', data: { idempotencyKey: 'demo-teszt', templateId: 'order-received', category: 'customer', to: 'demo@example.com', status: 'queued', isDemo: true, nextAttemptAt: clock.nowIso(), templateRef: { id: 'order-received', orderReference: 'BNY-MNTA-0002', proposalId: null, contactMessageId: null, status: null } }, overrideAccess: true })
    expect(await emailService.deliverJob(job.id)).toBe('cancelled')
    expect((await emailService.processDue(50)).processed).toBe(0)
    clock.advance(200 * HOUR_MS)
    expect(await priceChangeService.processDueProposals(SCHEDULER_AUTH)).toMatchObject({ proposalEmailsSent: 0, remindersSent: 0, expired: 0 })
  })
})

describe('development tools are restricted by APP_ENV', () => {
  const request = (path: string): NextRequest => new NextRequest(new URL(path, 'http://localhost:3000'))

  it('returns 404 in production and for missing or invalid APP_ENV, for every alias', () => {
    const original = process.env.APP_ENV
    try {
      for (const appEnv of ['production', '', 'prod', 'Production']) {
        process.env.APP_ENV = appEnv
        for (const path of ['/fejlesztes', '/fejlesztes/akarmi', '/fejleszt%C3%A9s', '/FEJLESZTES']) {
          expect(proxy(request(path)).status).toBe(404)
        }
        expect(areDevToolsEnabled()).toBe(false)
      }
      for (const appEnv of ['development', 'test', 'preview']) {
        process.env.APP_ENV = appEnv
        expect(proxy(request('/fejlesztes')).status).toBe(200)
        expect(areDevToolsEnabled()).toBe(true)
      }
    } finally {
      process.env.APP_ENV = original
    }
  })

  it('development server actions refuse to run in production', async () => {
    const original = process.env.APP_ENV
    process.env.APP_ENV = 'production'
    try {
      vi.doMock('next/headers', () => ({ headers: async () => new Headers() }))
      const { runSchedulerAction } = await import('@/app/(frontend)/fejlesztes/actions')
      await expect(runSchedulerAction()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
    } finally {
      process.env.APP_ENV = original
      vi.doUnmock('next/headers')
    }
  })
})
