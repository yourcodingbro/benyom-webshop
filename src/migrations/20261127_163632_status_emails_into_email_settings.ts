import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "email_settings" ADD COLUMN "status_emails_under_review" boolean DEFAULT false;
  ALTER TABLE "email_settings" ADD COLUMN "status_emails_confirmed" boolean DEFAULT true;
  ALTER TABLE "email_settings" ADD COLUMN "status_emails_procurement_in_progress" boolean DEFAULT false;
  ALTER TABLE "email_settings" ADD COLUMN "status_emails_ready_for_collection" boolean DEFAULT true;
  ALTER TABLE "email_settings" ADD COLUMN "status_emails_dispatched" boolean DEFAULT true;
  ALTER TABLE "email_settings" ADD COLUMN "status_emails_completed" boolean DEFAULT true;
  ALTER TABLE "email_settings" ADD COLUMN "status_emails_cancelled" boolean DEFAULT true;`)
  await copyStatusEmails(db, payload)
}

const SWITCHES: readonly string[] = ['under_review', 'confirmed', 'procurement_in_progress', 'ready_for_collection', 'dispatched', 'completed', 'cancelled']

/*
 * Data part: the per-status switches of Értesítési beállítások move to Email beállítások (same names). Only when a saved
 * notification row exists; otherwise the new columns' defaults are the same defaults the old global had.
 */
async function copyStatusEmails(db: MigrateUpArgs['db'], payload: MigrateUpArgs['payload']): Promise<void> {
  const source = (await db.execute(sql`SELECT * FROM "notification_settings" ORDER BY "id" LIMIT 1`)).rows[0] as Record<string, boolean | null> | undefined
  if (!source) {
    payload.logger.info('Állapotváltási e-mailek: nincs mentett értesítési beállítás, az alapértékek maradnak.')
    return
  }
  const target = (await db.execute(sql`SELECT "id" FROM "email_settings" ORDER BY "id" LIMIT 1`)).rows[0] as { id: number } | undefined
  const id = target?.id ?? ((await db.execute(sql`INSERT INTO "email_settings" ("updated_at", "created_at") VALUES (now(), now()) RETURNING "id"`)).rows[0] as { id: number }).id
  for (const name of SWITCHES) {
    const column = `status_emails_${name}`
    if (!(column in source)) continue
    await db.execute(sql`UPDATE "email_settings" SET ${sql.identifier(column)} = ${source[column]} WHERE "id" = ${id}`)
  }
  payload.logger.info('Állapotváltási e-mailek: kapcsolók áthelyezve az Email beállításokba.')
}


export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "email_settings" DROP COLUMN "status_emails_under_review";
  ALTER TABLE "email_settings" DROP COLUMN "status_emails_confirmed";
  ALTER TABLE "email_settings" DROP COLUMN "status_emails_procurement_in_progress";
  ALTER TABLE "email_settings" DROP COLUMN "status_emails_ready_for_collection";
  ALTER TABLE "email_settings" DROP COLUMN "status_emails_dispatched";
  ALTER TABLE "email_settings" DROP COLUMN "status_emails_completed";
  ALTER TABLE "email_settings" DROP COLUMN "status_emails_cancelled";`)
}
