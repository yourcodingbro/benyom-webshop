import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops the columns and tables whose data the previous migration (20261127_155841_settings_pages_split) copied to
 * Email beállítások, Főoldal beállítások and Áruház beállítások. Refuses to run (nothing dropped) if the copies are
 * missing, so no value can be lost.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const count = async (table: string): Promise<number> => ((await db.execute(sql`SELECT count(*)::int AS "n" FROM ${sql.identifier(table)}`)).rows[0] as { n: number }).n
  if ((await count('store_settings')) > 0 && ((await count('email_settings')) === 0 || (await count('homepage_settings')) === 0)) {
    throw new Error('Az e-mail vagy a főoldali beállítások még nincsenek áthelyezve (20261127_155841_settings_pages_split); semmit nem töröltünk.')
  }
  const highlights = await count('store_settings_homepage_highlights')
  if (highlights > 0 && (await count('homepage_settings_highlights')) === 0) {
    throw new Error('A főoldali előnyök még nincsenek áthelyezve; semmit nem töröltünk.')
  }
  await db.execute(sql`
   DROP TABLE "store_settings_homepage_highlights" CASCADE;
  DROP TABLE "header_settings" CASCADE;
  DROP TABLE "footer_settings" CASCADE;
  ALTER TABLE "store_settings" DROP COLUMN "store_contact_email";
  ALTER TABLE "store_settings" DROP COLUMN "email_from";
  ALTER TABLE "store_settings" DROP COLUMN "store_notification_email";
  ALTER TABLE "store_settings" DROP COLUMN "contact_recipient_email";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_hero_title";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_hero_text";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_hero_primary_label";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_hero_secondary_label";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_featured_heading";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_featured_count";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_featured_columns";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_featured_rows";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "store_settings_homepage_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "header_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_id" integer,
  	"favicon_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "footer_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slogan" varchar DEFAULT 'Előrendelés online, fizetés személyes átvételkor vagy kiszállításkor. Online fizetés nincs.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "store_settings" ADD COLUMN "store_contact_email" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "email_from" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "store_notification_email" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "contact_recipient_email" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_hero_title" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_hero_text" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_hero_primary_label" varchar DEFAULT 'Termékek böngészése' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_hero_secondary_label" varchar DEFAULT 'Hogyan működik?' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_featured_heading" varchar DEFAULT 'Kiemelt termékek';
  ALTER TABLE "store_settings" ADD COLUMN "homepage_featured_count" numeric DEFAULT 8 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_featured_columns" numeric DEFAULT 4 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_featured_rows" numeric DEFAULT 2 NOT NULL;
  ALTER TABLE "store_settings_homepage_highlights" ADD CONSTRAINT "store_settings_homepage_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "header_settings" ADD CONSTRAINT "header_settings_logo_id_branding_assets_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."branding_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "header_settings" ADD CONSTRAINT "header_settings_favicon_id_branding_assets_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."branding_assets"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "store_settings_homepage_highlights_order_idx" ON "store_settings_homepage_highlights" USING btree ("_order");
  CREATE INDEX "store_settings_homepage_highlights_parent_id_idx" ON "store_settings_homepage_highlights" USING btree ("_parent_id");
  CREATE INDEX "header_settings_logo_idx" ON "header_settings" USING btree ("logo_id");
  CREATE INDEX "header_settings_favicon_idx" ON "header_settings" USING btree ("favicon_id");`)
}
