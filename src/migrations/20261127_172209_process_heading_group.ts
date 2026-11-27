import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payment_settings" ADD COLUMN "preorder_steps_process_heading" varchar DEFAULT 'Az előrendelés menete' NOT NULL;`)
  // Data part: the "Az előrendelés menete" heading moves from the page-texts group into its own group.
  await db.execute(sql`UPDATE "payment_settings" SET "preorder_steps_process_heading" = "payment_page_process_heading"`)
  payload.logger.info('Az előrendelés menete: a szakaszcím áthelyezve.')
}


export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payment_settings" DROP COLUMN "preorder_steps_process_heading";`)
}
