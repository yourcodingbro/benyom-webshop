import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * The listing-page titles are code-managed again (the "Listaoldalak" tab was removed). The stored values are written
 * to the migration log before the columns are dropped, with a warning if they differ from the texts now in the pages.
 */
const CODE_TITLES: Readonly<Record<string, string>> = { products: 'Összes termék', categories: 'Összes kategória', brands: 'Összes márka' }

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const row = (await db.execute(sql`SELECT "listing_titles_products" AS "products", "listing_titles_categories" AS "categories", "listing_titles_brands" AS "brands" FROM "store_settings" ORDER BY "id" LIMIT 1`)).rows[0] as
    | Record<string, string | null>
    | undefined
  if (row) {
    const differs = Object.entries(CODE_TITLES).filter(([key, value]) => (row[key] ?? value) !== value)
    const message = `Listaoldal-címek (megszűnő beállítás): ${JSON.stringify(row)}.`
    if (differs.length > 0) payload.logger.warn(`${message} Eltér a kódban lévő címtől: ${differs.map(([key]) => key).join(', ')}.`)
    else payload.logger.info(`${message} Megegyezik a kódban lévő címekkel.`)
  }
  await db.execute(sql`
   ALTER TABLE "store_settings" DROP COLUMN "listing_titles_products";
  ALTER TABLE "store_settings" DROP COLUMN "listing_titles_categories";
  ALTER TABLE "store_settings" DROP COLUMN "listing_titles_brands";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "store_settings" ADD COLUMN "listing_titles_products" varchar DEFAULT 'Összes termék' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "listing_titles_categories" varchar DEFAULT 'Összes kategória' NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "listing_titles_brands" varchar DEFAULT 'Összes márka' NOT NULL;`)
}
