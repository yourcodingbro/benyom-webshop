import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payment_settings_preorder_steps_process_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "payment_settings_preorder_steps_process_steps" ADD CONSTRAINT "payment_settings_preorder_steps_process_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payment_settings_preorder_steps_process_steps_order_idx" ON "payment_settings_preorder_steps_process_steps" USING btree ("_order");
  CREATE INDEX "payment_settings_preorder_steps_process_steps_parent_id_idx" ON "payment_settings_preorder_steps_process_steps" USING btree ("_parent_id");`)
  // Data part: the preorder steps move from the page-texts group into "Az előrendelés menete" (row ids and order kept).
  // Idempotent: copied only while the new table is empty.
  const copied = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "payment_settings_preorder_steps_process_steps"`)).rows[0] as { n: number }
  if (copied.n === 0) {
    await db.execute(sql`INSERT INTO "payment_settings_preorder_steps_process_steps" ("_order", "_parent_id", "id", "text")
      SELECT "_order", "_parent_id", "id", "text" FROM "payment_settings_payment_page_process_steps"`)
  }
  payload.logger.info('Az előrendelés menete: a lépések áthelyezve.')
}


export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payment_settings_preorder_steps_process_steps" CASCADE;`)
}
