import { sql } from '@payloadcms/db-postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { planFeeReplacements, type up } from '@/migrations/20261119_194111_delivery_fee_free_or_fixed'
import { placeTestOrder, reload, resetWorld, testPayload } from '@/tests/helpers'

type Db = Parameters<typeof up>[0]['db']

beforeEach(async () => {
  await resetWorld()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})


describe('delivery fee migration (free / fixed only)', () => {
  it('requires an explicit replacement per legacy method and never turns it into free on its own', () => {
    const rows = [{ id: '1', methodId: 'csomagautomata', feeKind: 'unknown', feeAmount: null }]
    expect(planFeeReplacements([], undefined).size).toBe(0)
    expect(() => planFeeReplacements(rows, undefined)).toThrow(/csomagautomata/)
    expect(() => planFeeReplacements(rows, '{"masik":{"kind":"free"}}')).toThrow(/csomagautomata: nincs megadva/)
    for (const bad of ['{"csomagautomata":{"kind":"fixed"}}', '{"csomagautomata":{"kind":"fixed","amount":-1}}', '{"csomagautomata":{"kind":"fixed","amount":9.5}}', '{"csomagautomata":{"kind":"unknown"}}', 'nem-json']) {
      expect(() => planFeeReplacements(rows, bad)).toThrow()
    }
    expect(planFeeReplacements(rows, '{"csomagautomata":{"kind":"fixed","amount":1990}}').get('csomagautomata')).toEqual({ kind: 'fixed', amount: 1990 })
    expect(planFeeReplacements(rows, '{"csomagautomata":{"kind":"free"}}').get('csomagautomata')).toEqual({ kind: 'free' })
  })

  // The migration's rollback/replay ran on store_settings_delivery_methods; the delivery methods now live in
  // Fizetési és szállítási beállítások, whose table carries the same fixed-fee rule (20261127 payment_settings_global).
  it('keeps the fixed-fee rule on the delivery methods table and never changes order totals', async () => {
    const payload = await testPayload()
    const db = payload.db.drizzle as unknown as Db
    const order = await placeTestOrder()
    const totals = order.agreed.totals
    const row = (await db.execute(sql`SELECT "fee_kind"::text AS "feeKind" FROM "payment_settings_delivery_methods" WHERE "method_id" = 'hazhozszallitas'`)).rows[0] as { feeKind: string } | undefined
    expect(row?.feeKind).toBe('fixed')
    // Even outside Payload a fixed fee cannot lose its amount or become fractional.
    await expect(db.execute(sql`UPDATE "payment_settings_delivery_methods" SET "fee_amount" = NULL WHERE "method_id" = 'hazhozszallitas'`)).rejects.toThrow()
    await expect(db.execute(sql`UPDATE "payment_settings_delivery_methods" SET "fee_amount" = 10.5 WHERE "method_id" = 'hazhozszallitas'`)).rejects.toThrow()
    // Only free and fixed exist.
    await expect(db.execute(sql`UPDATE "payment_settings_delivery_methods" SET "fee_kind" = 'unknown' WHERE "method_id" = 'hazhozszallitas'`)).rejects.toThrow()
    expect((await reload(order)).agreed.totals).toEqual(totals)
  })

})
