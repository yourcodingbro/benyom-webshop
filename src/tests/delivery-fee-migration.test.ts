import { sql } from '@payloadcms/db-postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { down, planFeeReplacements, REPLACEMENTS_ENV, up } from '@/migrations/20261119_194111_delivery_fee_free_or_fixed'
import { placeTestOrder, reload, resetWorld, testPayload } from '@/tests/helpers'

type Db = Parameters<typeof up>[0]['db']

beforeEach(async () => {
  await resetWorld()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})
afterEach(() => {
  delete process.env[REPLACEMENTS_ENV]
  vi.restoreAllMocks()
})

async function feeRow(db: Db, methodId: string): Promise<{ feeKind: string; feeAmount: string | null }> {
  return (await db.execute(sql`SELECT "fee_kind"::text AS "feeKind", "fee_amount"::text AS "feeAmount" FROM "store_settings_delivery_methods" WHERE "method_id" = ${methodId}`)).rows[0] as { feeKind: string; feeAmount: string | null }
}

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

  it('migrates a stored "unknown" fee only with the given replacement, keeps order totals, and enforces fixed amounts', async () => {
    const payload = await testPayload()
    const db = payload.db.drizzle as unknown as Db
    const args = { db, payload, req: {} } as unknown as Parameters<typeof up>[0]
    const order = await placeTestOrder()
    const totals = order.agreed.totals
    // The test-only snapshot copy (test_snapshot schema) also uses the enum; detach it while the type is recreated.
    await db.execute(sql`ALTER TABLE test_snapshot."store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DATA TYPE text`)
    try {
      await down(args)
      await db.execute(sql`UPDATE "store_settings_delivery_methods" SET "fee_kind" = 'unknown', "fee_amount" = NULL WHERE "method_id" = 'csomagautomata'`)

      // No replacement given: refused before anything changes.
      await expect(up(args)).rejects.toThrow(/csomagautomata/)
      expect(await feeRow(db, 'csomagautomata')).toEqual({ feeKind: 'unknown', feeAmount: null })
      process.env[REPLACEMENTS_ENV] = '{"csomagautomata":{"kind":"fixed"}}'
      await expect(up(args)).rejects.toThrow(/érvénytelen/)
      expect(await feeRow(db, 'csomagautomata')).toEqual({ feeKind: 'unknown', feeAmount: null })

      process.env[REPLACEMENTS_ENV] = '{"csomagautomata":{"kind":"fixed","amount":1990}}'
      await up(args)
    } finally {
      // Leave the shared test database on the current schema even if an assertion failed.
      const enumValues = (await db.execute(sql`SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'enum_store_settings_delivery_methods_fee_kind'`)).rows.map((row) => (row as { enumlabel: string }).enumlabel)
      if (enumValues.includes('unknown')) {
        await db.execute(sql`UPDATE "store_settings_delivery_methods" SET "fee_kind" = 'free' WHERE "fee_kind" = 'unknown'`)
        delete process.env[REPLACEMENTS_ENV]
        await up(args)
      }
      await db.execute(sql`ALTER TABLE test_snapshot."store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DATA TYPE "public"."enum_store_settings_delivery_methods_fee_kind" USING "fee_kind"::"public"."enum_store_settings_delivery_methods_fee_kind"`)
    }
    expect(await feeRow(db, 'csomagautomata')).toEqual({ feeKind: 'fixed', feeAmount: '1990' })
    // The constraint keeps a fixed fee from ever losing its amount, even outside Payload.
    await expect(db.execute(sql`UPDATE "store_settings_delivery_methods" SET "fee_amount" = NULL WHERE "method_id" = 'csomagautomata'`)).rejects.toThrow()
    await expect(db.execute(sql`UPDATE "store_settings_delivery_methods" SET "fee_amount" = 10.5 WHERE "method_id" = 'csomagautomata'`)).rejects.toThrow()
    // Historical orders are untouched.
    expect((await reload(order)).agreed.totals).toEqual(totals)
  })
})
