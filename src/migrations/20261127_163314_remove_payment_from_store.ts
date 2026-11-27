import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops the payment/delivery columns and tables of Áruház beállítások, which the previous migration copied to
 * Fizetési és szállítási beállítások. Refuses to run (nothing dropped) if any copy is missing or incomplete.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const count = async (table: string): Promise<number> => ((await db.execute(sql`SELECT count(*)::int AS "n" FROM ${sql.identifier(table)}`)).rows[0] as { n: number }).n
  if ((await count('store_settings')) > 0 && (await count('payment_settings')) === 0) {
    throw new Error('A fizetési és szállítási beállítások még nincsenek áthelyezve (payment_settings_global); semmit nem töröltünk.')
  }
  for (const [from, to] of [
    ['store_settings_delivery_methods', 'payment_settings_delivery_methods'],
    ['store_settings_collection_opening_hours', 'payment_settings_collection_opening_hours'],
    ['store_settings_payment_page_payment_items', 'payment_settings_payment_page_payment_items'],
    ['store_settings_payment_page_process_steps', 'payment_settings_payment_page_process_steps'],
  ] as const) {
    if ((await count(from)) > (await count(to))) throw new Error(`Nem teljes az áthelyezés (${from} → ${to}); semmit nem töröltünk.`)
  }
  await db.execute(sql`
   DROP TABLE "store_settings_payment_page_payment_items" CASCADE;
  DROP TABLE "store_settings_payment_page_process_steps" CASCADE;
  DROP TABLE "store_settings_delivery_methods" CASCADE;
  DROP TABLE "store_settings_collection_opening_hours" CASCADE;
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_title";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_intro";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_payment_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_methods_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_collection_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_opening_hours_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_process_heading";
  ALTER TABLE "store_settings" DROP COLUMN "collection_address";
  ALTER TABLE "store_settings" DROP COLUMN "collection_note";
  DROP TYPE "public"."enum_store_settings_delivery_methods_kind";
  DROP TYPE "public"."enum_store_settings_delivery_methods_fee_kind";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_store_settings_delivery_methods_kind" AS ENUM('collection', 'delivery');
  CREATE TYPE "public"."enum_store_settings_delivery_methods_fee_kind" AS ENUM('free', 'fixed');
  CREATE TABLE "store_settings_payment_page_payment_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "store_settings_payment_page_process_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "store_settings_delivery_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"method_id" varchar NOT NULL,
  	"kind" "enum_store_settings_delivery_methods_kind" NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"enabled" boolean DEFAULT true,
  	"fee_kind" "enum_store_settings_delivery_methods_fee_kind" DEFAULT 'free' NOT NULL,
  	"fee_amount" numeric
  );
  
  CREATE TABLE "store_settings_collection_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"line" varchar NOT NULL
  );
  
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_title" varchar DEFAULT 'Fizetés és szállítás' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_intro" varchar DEFAULT 'Előrendelés esetén online fizetés nincs: a vételárat személyes átvételkor vagy kiszállításkor kell kiegyenlíteni.';
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_payment_heading" varchar DEFAULT 'Fizetés' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_methods_heading" varchar DEFAULT 'Átvételi és szállítási módok' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_collection_heading" varchar DEFAULT 'Személyes átvétel' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_opening_hours_heading" varchar DEFAULT 'Nyitvatartás' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_process_heading" varchar DEFAULT 'Az előrendelés menete' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "collection_address" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "collection_note" varchar;
  ALTER TABLE "store_settings_payment_page_payment_items" ADD CONSTRAINT "store_settings_payment_page_payment_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_payment_page_process_steps" ADD CONSTRAINT "store_settings_payment_page_process_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_delivery_methods" ADD CONSTRAINT "store_settings_delivery_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_collection_opening_hours" ADD CONSTRAINT "store_settings_collection_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "store_settings_payment_page_payment_items_order_idx" ON "store_settings_payment_page_payment_items" USING btree ("_order");
  CREATE INDEX "store_settings_payment_page_payment_items_parent_id_idx" ON "store_settings_payment_page_payment_items" USING btree ("_parent_id");
  CREATE INDEX "store_settings_payment_page_process_steps_order_idx" ON "store_settings_payment_page_process_steps" USING btree ("_order");
  CREATE INDEX "store_settings_payment_page_process_steps_parent_id_idx" ON "store_settings_payment_page_process_steps" USING btree ("_parent_id");
  CREATE INDEX "store_settings_delivery_methods_order_idx" ON "store_settings_delivery_methods" USING btree ("_order");
  CREATE INDEX "store_settings_delivery_methods_parent_id_idx" ON "store_settings_delivery_methods" USING btree ("_parent_id");
  CREATE INDEX "store_settings_collection_opening_hours_order_idx" ON "store_settings_collection_opening_hours" USING btree ("_order");
  CREATE INDEX "store_settings_collection_opening_hours_parent_id_idx" ON "store_settings_collection_opening_hours" USING btree ("_parent_id");`)
}
