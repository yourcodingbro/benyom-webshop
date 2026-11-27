import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payment_settings_payment_knowledge_payment_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "payment_settings" ADD COLUMN "payment_knowledge_payment_heading" varchar DEFAULT 'Fizetés' NOT NULL;
  ALTER TABLE "payment_settings_payment_knowledge_payment_items" ADD CONSTRAINT "payment_settings_payment_knowledge_payment_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payment_settings_payment_knowledge_payment_items_order_idx" ON "payment_settings_payment_knowledge_payment_items" USING btree ("_order");
  CREATE INDEX "payment_settings_payment_knowledge_payment_items_parent_id_idx" ON "payment_settings_payment_knowledge_payment_items" USING btree ("_parent_id");`)
  // Data part: the "Fizetés" heading and list move from the page-texts group into "Fizetési tudnivalók" (row ids and
  // order kept). Idempotent: the list is copied only while the new table is empty.
  await db.execute(sql`UPDATE "payment_settings" SET "payment_knowledge_payment_heading" = "payment_page_payment_heading"`)
  const copied = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "payment_settings_payment_knowledge_payment_items"`)).rows[0] as { n: number }
  if (copied.n === 0) {
    await db.execute(sql`INSERT INTO "payment_settings_payment_knowledge_payment_items" ("_order", "_parent_id", "id", "text")
      SELECT "_order", "_parent_id", "id", "text" FROM "payment_settings_payment_page_payment_items"`)
  }
  payload.logger.info('Fizetési tudnivalók: a „Fizetés” cím és felsorolás áthelyezve.')
}


export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payment_settings_payment_knowledge_payment_items" CASCADE;
  ALTER TABLE "payment_settings" DROP COLUMN "payment_knowledge_payment_heading";`)
}
