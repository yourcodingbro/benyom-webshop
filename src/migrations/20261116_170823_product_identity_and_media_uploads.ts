import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_media_upload_origin" AS ENUM('product-form');
  CREATE TABLE "product_slug_reservations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media" ADD COLUMN "upload_origin" "enum_media_upload_origin";
  ALTER TABLE "products" ADD COLUMN "primary_category_id" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_primary_category_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_slug_reservations_id" integer;
  CREATE UNIQUE INDEX "product_slug_reservations_slug_idx" ON "product_slug_reservations" USING btree ("slug");
  CREATE INDEX "product_slug_reservations_expires_at_idx" ON "product_slug_reservations" USING btree ("expires_at");
  CREATE INDEX "product_slug_reservations_updated_at_idx" ON "product_slug_reservations" USING btree ("updated_at");
  CREATE INDEX "product_slug_reservations_created_at_idx" ON "product_slug_reservations" USING btree ("created_at");
  ALTER TABLE "products" ADD CONSTRAINT "products_primary_category_id_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_primary_category_id_categories_id_fk" FOREIGN KEY ("version_primary_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_slug_reservations_fk" FOREIGN KEY ("product_slug_reservations_id") REFERENCES "public"."product_slug_reservations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_primary_category_idx" ON "products" USING btree ("primary_category_id");
  CREATE INDEX "_products_v_version_version_primary_category_idx" ON "_products_v" USING btree ("version_primary_category_id");
  CREATE INDEX "payload_locked_documents_rels_product_slug_reservations__idx" ON "payload_locked_documents_rels" USING btree ("product_slug_reservations_id");`)
  // Existing products: the primary category (media paths) is their first selected category, as for new ones.
  await db.execute(sql`
  UPDATE "products" p SET "primary_category_id" = r."categories_id"
  FROM (SELECT DISTINCT ON ("parent_id") "parent_id", "categories_id" FROM "products_rels" WHERE "path" = 'categories' AND "categories_id" IS NOT NULL ORDER BY "parent_id", "order") r
  WHERE r."parent_id" = p."id" AND p."primary_category_id" IS NULL;
  UPDATE "_products_v" v SET "version_primary_category_id" = r."categories_id"
  FROM (SELECT DISTINCT ON ("parent_id") "parent_id", "categories_id" FROM "_products_v_rels" WHERE "path" = 'version.categories' AND "categories_id" IS NOT NULL ORDER BY "parent_id", "order") r
  WHERE r."parent_id" = v."id" AND v."version_primary_category_id" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "product_slug_reservations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "product_slug_reservations" CASCADE;
  ALTER TABLE "products" DROP CONSTRAINT "products_primary_category_id_categories_id_fk";
  
  ALTER TABLE "_products_v" DROP CONSTRAINT "_products_v_version_primary_category_id_categories_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_slug_reservations_fk";
  
  DROP INDEX "products_primary_category_idx";
  DROP INDEX "_products_v_version_version_primary_category_idx";
  DROP INDEX "payload_locked_documents_rels_product_slug_reservations__idx";
  ALTER TABLE "media" DROP COLUMN "upload_origin";
  ALTER TABLE "products" DROP COLUMN "primary_category_id";
  ALTER TABLE "_products_v" DROP COLUMN "version_primary_category_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_slug_reservations_id";
  DROP TYPE "public"."enum_media_upload_origin";`)
}
