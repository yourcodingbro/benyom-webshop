import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payment_settings_delivery_methods_kind" AS ENUM('collection', 'delivery');
  CREATE TYPE "public"."enum_payment_settings_delivery_methods_fee_kind" AS ENUM('free', 'fixed');
  CREATE TABLE "payment_settings_payment_page_payment_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "payment_settings_payment_page_process_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "payment_settings_delivery_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"method_id" varchar NOT NULL,
  	"kind" "enum_payment_settings_delivery_methods_kind" NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"enabled" boolean DEFAULT true,
  	"fee_kind" "enum_payment_settings_delivery_methods_fee_kind" DEFAULT 'free' NOT NULL,
  	"fee_amount" numeric
  );
  
  CREATE TABLE "payment_settings_collection_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"line" varchar NOT NULL
  );
  
  CREATE TABLE "payment_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"payment_page_title" varchar DEFAULT 'Fizetés és szállítás' NOT NULL,
  	"payment_page_intro" varchar DEFAULT 'Előrendelés esetén online fizetés nincs: a vételárat személyes átvételkor vagy kiszállításkor kell kiegyenlíteni.',
  	"payment_page_payment_heading" varchar DEFAULT 'Fizetés' NOT NULL,
  	"payment_page_methods_heading" varchar DEFAULT 'Átvételi és szállítási módok' NOT NULL,
  	"payment_page_collection_heading" varchar DEFAULT 'Személyes átvétel' NOT NULL,
  	"payment_page_opening_hours_heading" varchar DEFAULT 'Nyitvatartás' NOT NULL,
  	"payment_page_process_heading" varchar DEFAULT 'Az előrendelés menete' NOT NULL,
  	"collection_address" varchar,
  	"collection_note" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payment_settings_payment_page_payment_items" ADD CONSTRAINT "payment_settings_payment_page_payment_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_settings_payment_page_process_steps" ADD CONSTRAINT "payment_settings_payment_page_process_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_settings_delivery_methods" ADD CONSTRAINT "payment_settings_delivery_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_settings_collection_opening_hours" ADD CONSTRAINT "payment_settings_collection_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payment_settings_payment_page_payment_items_order_idx" ON "payment_settings_payment_page_payment_items" USING btree ("_order");
  CREATE INDEX "payment_settings_payment_page_payment_items_parent_id_idx" ON "payment_settings_payment_page_payment_items" USING btree ("_parent_id");
  CREATE INDEX "payment_settings_payment_page_process_steps_order_idx" ON "payment_settings_payment_page_process_steps" USING btree ("_order");
  CREATE INDEX "payment_settings_payment_page_process_steps_parent_id_idx" ON "payment_settings_payment_page_process_steps" USING btree ("_parent_id");
  CREATE INDEX "payment_settings_delivery_methods_order_idx" ON "payment_settings_delivery_methods" USING btree ("_order");
  CREATE INDEX "payment_settings_delivery_methods_parent_id_idx" ON "payment_settings_delivery_methods" USING btree ("_parent_id");
  CREATE INDEX "payment_settings_collection_opening_hours_order_idx" ON "payment_settings_collection_opening_hours" USING btree ("_order");
  CREATE INDEX "payment_settings_collection_opening_hours_parent_id_idx" ON "payment_settings_collection_opening_hours" USING btree ("_parent_id");`)
  // Same rule as on the former table (20261119_194111): a fixed fee always has a whole, non-negative amount.
  await db.execute(sql`ALTER TABLE "payment_settings_delivery_methods" ADD CONSTRAINT "payment_settings_delivery_methods_fixed_fee_amount"
    CHECK ("fee_kind" <> 'fixed' OR ("fee_amount" IS NOT NULL AND "fee_amount" >= 0 AND "fee_amount" = trunc("fee_amount")))`)
  await copyPaymentSettings(db, payload)
}

/*
 * Data part (idempotent, nothing deleted; the next migration drops the old columns and tables): the payment page texts,
 * delivery methods (row ids, order, fees) and the collection point move from Áruház beállítások to
 * Fizetési és szállítási beállítások. Runs only while the new global is still empty.
 */
async function copyPaymentSettings(db: MigrateUpArgs['db'], payload: MigrateUpArgs['payload']): Promise<void> {
  const store = (await db.execute(sql`SELECT * FROM "store_settings" ORDER BY "id" LIMIT 1`)).rows[0] as Record<string, unknown> | undefined
  const existing = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "payment_settings"`)).rows[0] as { n: number }
  if (!store || existing.n > 0) {
    payload.logger.info('Fizetési és szállítási beállítások: nincs mit áthelyezni.')
    return
  }
  const inserted = (
    await db.execute(sql`INSERT INTO "payment_settings" ("payment_page_title", "payment_page_intro", "payment_page_payment_heading", "payment_page_methods_heading", "payment_page_collection_heading",
        "payment_page_opening_hours_heading", "payment_page_process_heading", "collection_address", "collection_note", "updated_at", "created_at")
      SELECT "payment_page_title", "payment_page_intro", "payment_page_payment_heading", "payment_page_methods_heading", "payment_page_collection_heading",
        "payment_page_opening_hours_heading", "payment_page_process_heading", "collection_address", "collection_note", now(), now()
      FROM "store_settings" WHERE "id" = ${store.id as number}
      RETURNING "id"`)
  ).rows[0] as { id: number }
  const parent = store.id as number
  await db.execute(sql`INSERT INTO "payment_settings_delivery_methods" ("_order", "_parent_id", "id", "method_id", "kind", "name", "description", "enabled", "fee_kind", "fee_amount")
    SELECT "_order", ${inserted.id}, "id", "method_id", "kind"::text::"enum_payment_settings_delivery_methods_kind", "name", "description", "enabled",
      "fee_kind"::text::"enum_payment_settings_delivery_methods_fee_kind", "fee_amount"
    FROM "store_settings_delivery_methods" WHERE "_parent_id" = ${parent}`)
  await db.execute(sql`INSERT INTO "payment_settings_collection_opening_hours" ("_order", "_parent_id", "id", "line")
    SELECT "_order", ${inserted.id}, "id", "line" FROM "store_settings_collection_opening_hours" WHERE "_parent_id" = ${parent}`)
  await db.execute(sql`INSERT INTO "payment_settings_payment_page_payment_items" ("_order", "_parent_id", "id", "text")
    SELECT "_order", ${inserted.id}, "id", "text" FROM "store_settings_payment_page_payment_items" WHERE "_parent_id" = ${parent}`)
  await db.execute(sql`INSERT INTO "payment_settings_payment_page_process_steps" ("_order", "_parent_id", "id", "text")
    SELECT "_order", ${inserted.id}, "id", "text" FROM "store_settings_payment_page_process_steps" WHERE "_parent_id" = ${parent}`)
  payload.logger.info('Fizetési és szállítási beállítások: oldalszövegek, szállítási módok és átvételi hely áthelyezve.')
}


export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payment_settings_payment_page_payment_items" CASCADE;
  DROP TABLE "payment_settings_payment_page_process_steps" CASCADE;
  DROP TABLE "payment_settings_delivery_methods" CASCADE;
  DROP TABLE "payment_settings_collection_opening_hours" CASCADE;
  DROP TABLE "payment_settings" CASCADE;
  DROP TYPE "public"."enum_payment_settings_delivery_methods_kind";
  DROP TYPE "public"."enum_payment_settings_delivery_methods_fee_kind";`)
}
