import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Drops the former location of the preorder heading; refuses (nothing dropped) if the copy differs. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const differs = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "payment_settings" WHERE "preorder_steps_process_heading" IS DISTINCT FROM "payment_page_process_heading"`)).rows[0] as { n: number }
  if (differs.n > 0) throw new Error('Az „Előrendelés menete” szakaszcím még nincs áthelyezve; semmit nem töröltünk.')
  await db.execute(sql`
   ALTER TABLE "payment_settings" DROP COLUMN "payment_page_process_heading";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payment_settings" ADD COLUMN "payment_page_process_heading" varchar DEFAULT 'Az előrendelés menete' NOT NULL;`)
}
