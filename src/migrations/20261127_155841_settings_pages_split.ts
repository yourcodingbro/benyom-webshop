import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "email_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"store_contact_email" varchar,
  	"email_from" varchar,
  	"store_notification_email" varchar,
  	"contact_recipient_email" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "homepage_settings_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "homepage_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hero_title" varchar,
  	"hero_text" varchar,
  	"hero_primary_label" varchar DEFAULT 'Termékek böngészése' NOT NULL,
  	"hero_secondary_label" varchar DEFAULT 'Hogyan működik?' NOT NULL,
  	"featured_heading" varchar DEFAULT 'Kiemelt termékek',
  	"featured_count" numeric DEFAULT 8 NOT NULL,
  	"featured_columns" numeric DEFAULT 4 NOT NULL,
  	"featured_rows" numeric DEFAULT 2 NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "store_settings" ADD COLUMN "logo_id" integer;
  ALTER TABLE "store_settings" ADD COLUMN "favicon_id" integer;
  ALTER TABLE "store_settings" ADD COLUMN "footer_slogan" varchar DEFAULT 'Előrendelés online, fizetés személyes átvételkor vagy kiszállításkor. Online fizetés nincs.';
  ALTER TABLE "homepage_settings_highlights" ADD CONSTRAINT "homepage_settings_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_settings_highlights_order_idx" ON "homepage_settings_highlights" USING btree ("_order");
  CREATE INDEX "homepage_settings_highlights_parent_id_idx" ON "homepage_settings_highlights" USING btree ("_parent_id");
  ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_logo_id_branding_assets_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."branding_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_favicon_id_branding_assets_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."branding_assets"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "store_settings_logo_idx" ON "store_settings" USING btree ("logo_id");
  CREATE INDEX "store_settings_favicon_idx" ON "store_settings" USING btree ("favicon_id");`)
  await moveSettings(db, payload)
}

/*
 * Data part (idempotent, nothing deleted here; the old columns/tables are dropped by the next migration):
 * - Email beállítások ← store_settings email columns (incl. the two hidden legacy recipient fields)
 * - Főoldal beállítások ← store_settings homepage columns and highlight rows
 * - Áruház beállítások logo/favicon ← header_settings, footer slogan ← footer_settings
 */
async function moveSettings(db: MigrateUpArgs['db'], payload: MigrateUpArgs['payload']): Promise<void> {
  const store = (await db.execute(sql`SELECT * FROM "store_settings" ORDER BY "id" LIMIT 1`)).rows[0] as Record<string, unknown> | undefined
  if (!store) {
    payload.logger.info('Beállítások szétválasztása: nincs még áruház-beállítás, nincs mit áthelyezni.')
    return
  }

  const emailRows = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "email_settings"`)).rows[0] as { n: number }
  if (emailRows.n === 0) {
    await db.execute(sql`INSERT INTO "email_settings" ("store_contact_email", "email_from", "store_notification_email", "contact_recipient_email", "updated_at", "created_at")
      VALUES (${store.store_contact_email ?? null}, ${store.email_from ?? null}, ${store.store_notification_email ?? null}, ${store.contact_recipient_email ?? null}, now(), now())`)
  }

  const homepageRows = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "homepage_settings"`)).rows[0] as { n: number }
  if (homepageRows.n === 0) {
    const inserted = (
      await db.execute(sql`INSERT INTO "homepage_settings" ("hero_title", "hero_text", "hero_primary_label", "hero_secondary_label", "featured_heading", "featured_count", "featured_columns", "featured_rows", "updated_at", "created_at")
        VALUES (${store.homepage_hero_title ?? null}, ${store.homepage_hero_text ?? null}, ${store.homepage_hero_primary_label ?? 'Termékek böngészése'}, ${store.homepage_hero_secondary_label ?? 'Hogyan működik?'},
          ${store.homepage_featured_heading ?? null}, ${store.homepage_featured_count ?? 8}, ${store.homepage_featured_columns ?? 4}, ${store.homepage_featured_rows ?? 2}, now(), now())
        RETURNING "id"`)
    ).rows[0] as { id: number }
    await db.execute(sql`INSERT INTO "homepage_settings_highlights" ("_order", "_parent_id", "id", "title", "text")
      SELECT "_order", ${inserted.id}, "id", "title", "text" FROM "store_settings_homepage_highlights" WHERE "_parent_id" = ${store.id as number}`)
  }

  // Header/footer globals → Áruház beállítások (only where the store row has nothing yet).
  const header = (await db.execute(sql`SELECT "logo_id", "favicon_id" FROM "header_settings" ORDER BY "id" LIMIT 1`)).rows[0] as { logo_id: number | null; favicon_id: number | null } | undefined
  if (header) {
    await db.execute(sql`UPDATE "store_settings" SET "logo_id" = COALESCE("logo_id", ${header.logo_id}), "favicon_id" = COALESCE("favicon_id", ${header.favicon_id}) WHERE "id" = ${store.id as number}`)
  }
  const footer = (await db.execute(sql`SELECT "slogan" FROM "footer_settings" ORDER BY "id" LIMIT 1`)).rows[0] as { slogan: string | null } | undefined
  if (footer) {
    await db.execute(sql`UPDATE "store_settings" SET "footer_slogan" = ${footer.slogan} WHERE "id" = ${store.id as number}`)
  }
  payload.logger.info('Beállítások szétválasztása: e-mail és főoldali beállítások áthelyezve, fejléc és lábléc az áruház-beállításokba.')
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "email_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_settings_highlights" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "email_settings" CASCADE;
  DROP TABLE "homepage_settings_highlights" CASCADE;
  DROP TABLE "homepage_settings" CASCADE;
  ALTER TABLE "store_settings" DROP CONSTRAINT "store_settings_logo_id_branding_assets_id_fk";
  
  ALTER TABLE "store_settings" DROP CONSTRAINT "store_settings_favicon_id_branding_assets_id_fk";
  
  DROP INDEX "store_settings_logo_idx";
  DROP INDEX "store_settings_favicon_idx";
  ALTER TABLE "store_settings" DROP COLUMN "logo_id";
  ALTER TABLE "store_settings" DROP COLUMN "favicon_id";
  ALTER TABLE "store_settings" DROP COLUMN "footer_slogan";`)
}
