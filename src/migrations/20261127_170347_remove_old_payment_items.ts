import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Drops the former location of the "Fizetés" list and heading; refuses (nothing dropped) if the copy is incomplete. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const count = async (table: string): Promise<number> => ((await db.execute(sql`SELECT count(*)::int AS "n" FROM ${sql.identifier(table)}`)).rows[0] as { n: number }).n
  if ((await count('payment_settings_payment_page_payment_items')) > (await count('payment_settings_payment_knowledge_payment_items'))) {
    throw new Error('A fizetési tudnivalók még nincsenek teljesen áthelyezve; semmit nem töröltünk.')
  }
  const heading = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "payment_settings" WHERE "payment_knowledge_payment_heading" IS DISTINCT FROM "payment_page_payment_heading"`)).rows[0] as { n: number }
  if (heading.n > 0) throw new Error('A „Fizetés” szakaszcím még nincs áthelyezve; semmit nem töröltünk.')
  await db.execute(sql`
   DROP TABLE "payment_settings_payment_page_payment_items" CASCADE;
  ALTER TABLE "payment_settings" DROP COLUMN "payment_page_payment_heading";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payment_settings_payment_page_payment_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "payment_settings" ADD COLUMN "payment_page_payment_heading" varchar DEFAULT 'Fizetés' NOT NULL;
  ALTER TABLE "payment_settings_payment_page_payment_items" ADD CONSTRAINT "payment_settings_payment_page_payment_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payment_settings_payment_page_payment_items_order_idx" ON "payment_settings_payment_page_payment_items" USING btree ("_order");
  CREATE INDEX "payment_settings_payment_page_payment_items_parent_id_idx" ON "payment_settings_payment_page_payment_items" USING btree ("_parent_id");`)
}
