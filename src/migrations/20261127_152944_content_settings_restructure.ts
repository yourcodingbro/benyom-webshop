import { randomBytes } from 'node:crypto'

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "branding_assets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"prefix" varchar DEFAULT 'branding',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "faqs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"published" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
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
  
  ALTER TABLE "store_settings" ALTER COLUMN "homepage_featured_heading" SET DEFAULT 'Kiemelt termékek';
  ALTER TABLE "brands" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "brands" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "categories" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "categories" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "price_change_proposals" ADD COLUMN "response_hours_initial" numeric DEFAULT 24 NOT NULL;
  ALTER TABLE "price_change_proposals" ADD COLUMN "response_hours_reminder" numeric DEFAULT 24 NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "branding_assets_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "faqs_id" integer;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_hero_primary_label" varchar DEFAULT 'Termékek böngészése' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_hero_secondary_label" varchar DEFAULT 'Hogyan működik?' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_featured_count" numeric DEFAULT 8 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_featured_columns" numeric DEFAULT 4 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "homepage_featured_rows" numeric DEFAULT 2 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_title" varchar DEFAULT 'Fizetés és szállítás' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_intro" varchar DEFAULT 'Előrendelés esetén online fizetés nincs: a vételárat személyes átvételkor vagy kiszállításkor kell kiegyenlíteni.';
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_payment_heading" varchar DEFAULT 'Fizetés' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_methods_heading" varchar DEFAULT 'Átvételi és szállítási módok' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_collection_heading" varchar DEFAULT 'Személyes átvétel' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_opening_hours_heading" varchar DEFAULT 'Nyitvatartás' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "payment_page_process_heading" varchar DEFAULT 'Az előrendelés menete' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "listing_titles_products" varchar DEFAULT 'Összes termék' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "listing_titles_categories" varchar DEFAULT 'Összes kategória' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "listing_titles_brands" varchar DEFAULT 'Összes márka' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "limits_max_line_quantity" numeric DEFAULT 5 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "limits_max_cart_lines" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "limits_price_change_response_hours" numeric DEFAULT 24 NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "limits_price_change_reminder_hours" numeric DEFAULT 24 NOT NULL;
  ALTER TABLE "header_settings" ADD CONSTRAINT "header_settings_logo_id_branding_assets_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."branding_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "header_settings" ADD CONSTRAINT "header_settings_favicon_id_branding_assets_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."branding_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "store_settings_payment_page_payment_items" ADD CONSTRAINT "store_settings_payment_page_payment_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_payment_page_process_steps" ADD CONSTRAINT "store_settings_payment_page_process_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "branding_assets_updated_at_idx" ON "branding_assets" USING btree ("updated_at");
  CREATE INDEX "branding_assets_created_at_idx" ON "branding_assets" USING btree ("created_at");
  CREATE UNIQUE INDEX "branding_assets_filename_idx" ON "branding_assets" USING btree ("filename");
  CREATE INDEX "faqs__order_idx" ON "faqs" USING btree ("_order");
  CREATE INDEX "faqs_published_idx" ON "faqs" USING btree ("published");
  CREATE INDEX "faqs_updated_at_idx" ON "faqs" USING btree ("updated_at");
  CREATE INDEX "faqs_created_at_idx" ON "faqs" USING btree ("created_at");
  CREATE INDEX "header_settings_logo_idx" ON "header_settings" USING btree ("logo_id");
  CREATE INDEX "header_settings_favicon_idx" ON "header_settings" USING btree ("favicon_id");
  CREATE INDEX "store_settings_payment_page_payment_items_order_idx" ON "store_settings_payment_page_payment_items" USING btree ("_order");
  CREATE INDEX "store_settings_payment_page_payment_items_parent_id_idx" ON "store_settings_payment_page_payment_items" USING btree ("_parent_id");
  CREATE INDEX "store_settings_payment_page_process_steps_order_idx" ON "store_settings_payment_page_process_steps" USING btree ("_order");
  CREATE INDEX "store_settings_payment_page_process_steps_parent_id_idx" ON "store_settings_payment_page_process_steps" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_branding_assets_fk" FOREIGN KEY ("branding_assets_id") REFERENCES "public"."branding_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_branding_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("branding_assets_id");
  CREATE INDEX "payload_locked_documents_rels_faqs_id_idx" ON "payload_locked_documents_rels" USING btree ("faqs_id");`)
  await seedContent(db, payload)
}

/*
 * Data part (idempotent). Scalar fields got their former hardcoded values as column defaults above; here the list
 * contents that used to live in code are inserted once: the payment/delivery page lists, the FAQ entries, and the
 * footer slogan row. The texts are a frozen copy (migrations must not depend on later code changes).
 */
const PAYMENT_ITEMS: readonly string[] = [
  'Személyes átvételnél a helyszínen, kiszállításnál a futárnál fizet.',
  'Online fizetés nincs, bankkártyaadatot nem kérünk, és a rendelés leadásakor semmit nem kell fizetni.',
  'Számlát a webshop nem állít ki automatikusan.',
]
const PROCESS_STEPS: readonly string[] = [
  'A leadott rendelést e-mailben visszaigazoljuk, majd megkezdjük a beszerzést.',
  'A termékoldalakon látható beszerzési idő becslés, nem garantált határidő.',
  'Ha a beszerzési ár változna, árváltozási ajánlatot küldünk; az ár csak az Ön kifejezett elfogadásával módosul. Elutasítás esetén a teljes rendelés törlődik.',
  'Amikor a rendelés átvehető vagy úton van, e-mailben értesítjük.',
]
const FAQ_ENTRIES: readonly { question: string; answer: string }[] = [
  { question: 'Kell-e online fizetnem?', answer: 'Nem. A fizetés átvételkor vagy kiszállításkor történik.' },
  { question: 'Változhat-e a rendelésem ára?', answer: 'Csak akkor, ha Ön egy árváltozási ajánlatot kifejezetten elfogadja.' },
  {
    question: 'Mi történik, ha nem válaszolok az árváltozási ajánlatra?',
    answer: '24 óra után emlékeztetőt küldünk; az emlékeztető elküldését követő újabb 24 óra elteltével a rendelés törlődik.',
  },
]
const DIGITS: string = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const rowId = (): string => randomBytes(12).toString('hex')

async function seedContent(db: MigrateUpArgs['db'], payload: MigrateUpArgs['payload']): Promise<void> {
  // Same byte-wise collation as brands/categories, so Payload's fractional order keys sort correctly.
  await db.execute(sql`ALTER TABLE "faqs" ALTER COLUMN "_order" TYPE varchar COLLATE "C"`)

  const settings = (await db.execute(sql`SELECT "id" FROM "store_settings" ORDER BY "id" LIMIT 1`)).rows[0] as { id: number } | undefined
  if (settings) {
    for (const [table, lines] of [['store_settings_payment_page_payment_items', PAYMENT_ITEMS], ['store_settings_payment_page_process_steps', PROCESS_STEPS]] as const) {
      const existing = (await db.execute(sql`SELECT count(*)::int AS "n" FROM ${sql.identifier(table)} WHERE "_parent_id" = ${settings.id}`)).rows[0] as { n: number }
      if (existing.n > 0) continue
      for (const [index, text] of lines.entries()) {
        await db.execute(sql`INSERT INTO ${sql.identifier(table)} ("_order", "_parent_id", "id", "text") VALUES (${index + 1}, ${settings.id}, ${rowId()}, ${text})`)
      }
    }
  }

  // FAQ: each former entry once (matched by question), appended after any existing ones.
  const known = new Set(((await db.execute(sql`SELECT "question" FROM "faqs"`)).rows as { question: string }[]).map((row) => row.question))
  let position = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "faqs"`)).rows[0] as { n: number }
  for (const entry of FAQ_ENTRIES) {
    if (known.has(entry.question)) continue
    await db.execute(sql`INSERT INTO "faqs" ("_order", "question", "answer", "published", "updated_at", "created_at") VALUES (${`a${DIGITS[position.n]}`}, ${entry.question}, ${entry.answer}, true, now(), now())`)
    position = { n: position.n + 1 }
  }

  // Footer slogan: the global's row with the former footer text (Payload creates globals lazily).
  const footer = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "footer_settings"`)).rows[0] as { n: number }
  if (footer.n === 0) {
    await db.execute(sql`INSERT INTO "footer_settings" ("slogan", "updated_at", "created_at") VALUES (${'Előrendelés online, fizetés személyes átvételkor vagy kiszállításkor. Online fizetés nincs.'}, now(), now())`)
  }
  payload.logger.info('Tartalom-beállítások: fizetés/szállítás listák, GYIK-kérdések és lábléc-szlogen előkészítve.')
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "branding_assets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "header_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "store_settings_payment_page_payment_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "store_settings_payment_page_process_steps" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "branding_assets" CASCADE;
  DROP TABLE "faqs" CASCADE;
  DROP TABLE "header_settings" CASCADE;
  DROP TABLE "footer_settings" CASCADE;
  DROP TABLE "store_settings_payment_page_payment_items" CASCADE;
  DROP TABLE "store_settings_payment_page_process_steps" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_branding_assets_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_faqs_fk";
  
  DROP INDEX "payload_locked_documents_rels_branding_assets_id_idx";
  DROP INDEX "payload_locked_documents_rels_faqs_id_idx";
  ALTER TABLE "store_settings" ALTER COLUMN "homepage_featured_heading" DROP DEFAULT;
  ALTER TABLE "brands" DROP COLUMN "seo_title";
  ALTER TABLE "brands" DROP COLUMN "seo_description";
  ALTER TABLE "categories" DROP COLUMN "seo_title";
  ALTER TABLE "categories" DROP COLUMN "seo_description";
  ALTER TABLE "price_change_proposals" DROP COLUMN "response_hours_initial";
  ALTER TABLE "price_change_proposals" DROP COLUMN "response_hours_reminder";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "branding_assets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "faqs_id";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_hero_primary_label";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_hero_secondary_label";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_featured_count";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_featured_columns";
  ALTER TABLE "store_settings" DROP COLUMN "homepage_featured_rows";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_title";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_intro";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_payment_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_methods_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_collection_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_opening_hours_heading";
  ALTER TABLE "store_settings" DROP COLUMN "payment_page_process_heading";
  ALTER TABLE "store_settings" DROP COLUMN "listing_titles_products";
  ALTER TABLE "store_settings" DROP COLUMN "listing_titles_categories";
  ALTER TABLE "store_settings" DROP COLUMN "listing_titles_brands";
  ALTER TABLE "store_settings" DROP COLUMN "limits_max_line_quantity";
  ALTER TABLE "store_settings" DROP COLUMN "limits_max_cart_lines";
  ALTER TABLE "store_settings" DROP COLUMN "limits_price_change_response_hours";
  ALTER TABLE "store_settings" DROP COLUMN "limits_price_change_reminder_hours";`)
}
