import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sale_entries_dimension" AS ENUM('brand', 'category');
  ALTER TYPE "public"."enum_order_events_type" ADD VALUE 'receipt_recorded' BEFORE 'submitted';
  ALTER TYPE "public"."enum_order_events_type" ADD VALUE 'sale_recorded' BEFORE 'submitted';
  CREATE TABLE "product_slug_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"product_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sale_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"entry_key" varchar NOT NULL,
  	"order_id" integer NOT NULL,
  	"order_reference" varchar,
  	"line_id" varchar,
  	"sku" varchar,
  	"dimension" "enum_sale_entries_dimension" NOT NULL,
  	"key" varchar NOT NULL,
  	"quantity" numeric NOT NULL,
  	"sold_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "brands" ADD COLUMN "_order" varchar;
  ALTER TABLE "categories" ADD COLUMN "_order" varchar;
  ALTER TABLE "orders_items" ADD COLUMN "brand_id" varchar;
  ALTER TABLE "orders_items" ADD COLUMN "category_ids" jsonb;
  ALTER TABLE "orders" ADD COLUMN "received_by_customer_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "completed_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "sale_recorded_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_slug_history_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sale_entries_id" integer;
  ALTER TABLE "product_slug_history" ADD CONSTRAINT "product_slug_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sale_entries" ADD CONSTRAINT "sale_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "product_slug_history_slug_idx" ON "product_slug_history" USING btree ("slug");
  CREATE INDEX "product_slug_history_product_idx" ON "product_slug_history" USING btree ("product_id");
  CREATE INDEX "product_slug_history_updated_at_idx" ON "product_slug_history" USING btree ("updated_at");
  CREATE INDEX "product_slug_history_created_at_idx" ON "product_slug_history" USING btree ("created_at");
  CREATE UNIQUE INDEX "sale_entries_entry_key_idx" ON "sale_entries" USING btree ("entry_key");
  CREATE INDEX "sale_entries_order_idx" ON "sale_entries" USING btree ("order_id");
  CREATE INDEX "sale_entries_key_idx" ON "sale_entries" USING btree ("key");
  CREATE INDEX "sale_entries_sold_at_idx" ON "sale_entries" USING btree ("sold_at");
  CREATE INDEX "sale_entries_updated_at_idx" ON "sale_entries" USING btree ("updated_at");
  CREATE INDEX "sale_entries_created_at_idx" ON "sale_entries" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_slug_history_fk" FOREIGN KEY ("product_slug_history_id") REFERENCES "public"."product_slug_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sale_entries_fk" FOREIGN KEY ("sale_entries_id") REFERENCES "public"."sale_entries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "brands__order_idx" ON "brands" USING btree ("_order");
  CREATE INDEX "categories__order_idx" ON "categories" USING btree ("_order");
  CREATE INDEX "orders_sale_recorded_at_idx" ON "orders" USING btree ("sale_recorded_at");
  CREATE INDEX "payload_locked_documents_rels_product_slug_history_id_idx" ON "payload_locked_documents_rels" USING btree ("product_slug_history_id");
  CREATE INDEX "payload_locked_documents_rels_sale_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("sale_entries_id");`)

  // Initial manual order for the drag-and-drop lists: the previous order (sortOrder, name, id) as
  // fractional-index keys (same format as Payload's `orderable`: "a0" … "az", then "b00" …).
  // Fractional keys compare byte-wise ("aV" < "aa"); locale collations (en_US) would misorder mixed case.
  await db.execute(sql`ALTER TABLE "brands" ALTER COLUMN "_order" TYPE varchar COLLATE "C"; ALTER TABLE "categories" ALTER COLUMN "_order" TYPE varchar COLLATE "C";`)
  for (const table of ['brands', 'categories']) {
    const rows = await db.execute(sql`select id from ${sql.identifier(table)} where _order is null order by sort_order asc nulls last, name asc, id asc`)
    for (const [index, row] of rows.rows.entries()) {
      await db.execute(sql`update ${sql.identifier(table)} set _order = ${orderKey(index)} where id = ${String((row as { id: unknown }).id)}`)
    }
  }

  // Sales attribution for existing order lines (later sales use the values fixed at checkout).
  await db.execute(sql`
  UPDATE "orders_items" oi SET "brand_id" = p."brand_id"
  FROM "products_variants" pv JOIN "products" p ON p."id" = pv."_parent_id"
  WHERE pv."sku" = oi."sku" AND oi."brand_id" IS NULL;
  UPDATE "orders_items" oi SET "category_ids" = c."ids"
  FROM (
    SELECT pv."sku", jsonb_agg(r."categories_id" ORDER BY r."order") AS "ids"
    FROM "products_variants" pv JOIN "products_rels" r ON r."parent_id" = pv."_parent_id" AND r."path" = 'categories' AND r."categories_id" IS NOT NULL
    GROUP BY pv."sku"
  ) c
  WHERE c."sku" = oi."sku" AND oi."category_ids" IS NULL;`)
}

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** n-th fractional-index key in ascending order (valid for Payload's generateKeyBetween). */
function orderKey(index: number): string {
  if (index < 62) return `a${DIGITS[index]}`
  const rest = index - 62
  return `b${DIGITS[Math.floor(rest / 62) % 62]}${DIGITS[rest % 62]}`
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "product_slug_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sale_entries" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "product_slug_history" CASCADE;
  DROP TABLE "sale_entries" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_slug_history_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sale_entries_fk";
  
  ALTER TABLE "order_events" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_order_events_type";
  CREATE TYPE "public"."enum_order_events_type" AS ENUM('submitted', 'imported', 'status_changed', 'payment_changed', 'admin_edit', 'note_added', 'price_review_flagged', 'proposal_created', 'proposal_superseded', 'proposal_accepted', 'proposal_rejected', 'proposal_expired', 'proposal_withdrawn', 'cancelled', 'notification_queued', 'notification_skipped', 'notification_submitted', 'notification_failed', 'notification_delivered', 'notification_bounced');
  ALTER TABLE "order_events" ALTER COLUMN "type" SET DATA TYPE "public"."enum_order_events_type" USING "type"::"public"."enum_order_events_type";
  DROP INDEX "brands__order_idx";
  DROP INDEX "categories__order_idx";
  DROP INDEX "orders_sale_recorded_at_idx";
  DROP INDEX "payload_locked_documents_rels_product_slug_history_id_idx";
  DROP INDEX "payload_locked_documents_rels_sale_entries_id_idx";
  ALTER TABLE "brands" DROP COLUMN "_order";
  ALTER TABLE "categories" DROP COLUMN "_order";
  ALTER TABLE "orders_items" DROP COLUMN "brand_id";
  ALTER TABLE "orders_items" DROP COLUMN "category_ids";
  ALTER TABLE "orders" DROP COLUMN "received_by_customer_at";
  ALTER TABLE "orders" DROP COLUMN "paid_at";
  ALTER TABLE "orders" DROP COLUMN "completed_at";
  ALTER TABLE "orders" DROP COLUMN "sale_recorded_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_slug_history_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sale_entries_id";
  DROP TYPE "public"."enum_sale_entries_dimension";`)
}
