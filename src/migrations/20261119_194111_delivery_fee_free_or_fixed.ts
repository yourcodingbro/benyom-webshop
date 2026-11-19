import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** One delivery method whose stored fee is not valid under the free/fixed rules. */
export type LegacyFeeRow = { id: string; methodId: string; feeKind: string; feeAmount: string | number | null }
export type FeeReplacement = { kind: 'free' } | { kind: 'fixed'; amount: number }

export const REPLACEMENTS_ENV = 'DELIVERY_FEE_REPLACEMENTS'
const EXAMPLE = `${REPLACEMENTS_ENV}='{"csomagautomata":{"kind":"fixed","amount":1990}}' npm run migrate   (vagy {"kind":"free"})`

/**
 * Every legacy row needs an explicit replacement from the operator, keyed by methodId: no fee is invented and
 * nothing silently becomes free. Throws (the migration's transaction rolls back) unless all rows are covered.
 */
export function planFeeReplacements(rows: LegacyFeeRow[], raw: string | undefined): Map<string, FeeReplacement> {
  const plan = new Map<string, FeeReplacement>()
  if (rows.length === 0) return plan
  const listed = rows.map((row) => `${row.methodId} (${row.feeKind}${row.feeKind === 'fixed' ? `, díj: ${row.feeAmount ?? 'nincs'}` : ''})`).join(', ')
  let parsed: unknown
  try {
    parsed = raw ? JSON.parse(raw) : undefined
  } catch {
    throw new Error(`${REPLACEMENTS_ENV} nem érvényes JSON. Példa: ${EXAMPLE}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Ezeknek a szállítási módoknak nincs érvényes díja: ${listed}. Adjon meg mindegyikhez cserét (free vagy fixed + összeg) a(z) ${REPLACEMENTS_ENV} változóban. Példa: ${EXAMPLE}`)
  }
  const given = parsed as Record<string, unknown>
  const problems: string[] = []
  for (const row of rows) {
    const value = given[row.methodId] as { kind?: unknown; amount?: unknown } | undefined
    if (value?.kind === 'free') plan.set(row.methodId, { kind: 'free' })
    else if (value?.kind === 'fixed' && typeof value.amount === 'number' && Number.isSafeInteger(value.amount) && value.amount >= 0) plan.set(row.methodId, { kind: 'fixed', amount: value.amount })
    else problems.push(value === undefined ? `${row.methodId}: nincs megadva` : `${row.methodId}: érvénytelen (free, vagy fixed nemnegatív egész forintösszeggel)`)
  }
  if (problems.length > 0) throw new Error(`Hiányzó vagy érvénytelen díjcsere: ${problems.join('; ')}. Érintett módok: ${listed}. Példa: ${EXAMPLE}`)
  return plan
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // Rows the new rules would reject: the removed "unknown" mode, or a fixed fee without a whole non-negative amount.
  const rows = (
    await db.execute(sql`
      SELECT "id", "method_id" AS "methodId", "fee_kind"::text AS "feeKind", "fee_amount" AS "feeAmount"
      FROM "store_settings_delivery_methods"
      WHERE "fee_kind"::text NOT IN ('free', 'fixed')
         OR ("fee_kind"::text = 'fixed' AND ("fee_amount" IS NULL OR "fee_amount" < 0 OR "fee_amount" <> trunc("fee_amount")))
      ORDER BY "_order"`)
  ).rows as LegacyFeeRow[]
  const plan = planFeeReplacements(rows, process.env[REPLACEMENTS_ENV])

  await db.execute(sql`
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DATA TYPE text;
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DEFAULT 'free'::text;`)
  for (const row of rows) {
    const next = plan.get(row.methodId)
    if (!next) continue
    // Only the store's current setting changes; orders keep the fee and totals they were placed with.
    await db.execute(sql`UPDATE "store_settings_delivery_methods" SET "fee_kind" = ${next.kind}, "fee_amount" = ${next.kind === 'fixed' ? next.amount : null} WHERE "id" = ${row.id}`)
    payload.logger.info(`Szállítási díj: ${row.methodId} – ${row.feeKind} → ${next.kind === 'fixed' ? `fixed (${next.amount} Ft)` : 'free'}.`)
  }
  await db.execute(sql`
    DROP TYPE "public"."enum_store_settings_delivery_methods_fee_kind";
    CREATE TYPE "public"."enum_store_settings_delivery_methods_fee_kind" AS ENUM('free', 'fixed');
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DEFAULT 'free'::"public"."enum_store_settings_delivery_methods_fee_kind";
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DATA TYPE "public"."enum_store_settings_delivery_methods_fee_kind" USING "fee_kind"::"public"."enum_store_settings_delivery_methods_fee_kind";
    ALTER TABLE "store_settings_delivery_methods" ADD CONSTRAINT "store_settings_delivery_methods_fixed_fee_amount"
      CHECK ("fee_kind" <> 'fixed' OR ("fee_amount" IS NOT NULL AND "fee_amount" >= 0 AND "fee_amount" = trunc("fee_amount")));`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Recreated rather than ALTER TYPE … ADD VALUE: a value added in this transaction could not be used as the default.
  // Replaced fees stay as they are (the former "unknown" is not restored).
  await db.execute(sql`
    ALTER TABLE "store_settings_delivery_methods" DROP CONSTRAINT IF EXISTS "store_settings_delivery_methods_fixed_fee_amount";
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" DROP DEFAULT;
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DATA TYPE text;
    DROP TYPE "public"."enum_store_settings_delivery_methods_fee_kind";
    CREATE TYPE "public"."enum_store_settings_delivery_methods_fee_kind" AS ENUM('unknown', 'free', 'fixed');
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DATA TYPE "public"."enum_store_settings_delivery_methods_fee_kind" USING "fee_kind"::"public"."enum_store_settings_delivery_methods_fee_kind";
    ALTER TABLE "store_settings_delivery_methods" ALTER COLUMN "fee_kind" SET DEFAULT 'unknown';`)
}
