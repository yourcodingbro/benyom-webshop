import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * General SEO is code-managed from now on (src/config/seo.ts holds the former "SEO alapértékek" values). The stored
 * values are written to the migration log before the columns are dropped, with a warning when they differ from the
 * code constants, so no configured value disappears silently. Frozen copy of the constants at the time of writing:
 */
const CODE_TITLE: string = 'Benyom Webshop – telefonok, tabletek és okosórák előrendelésre'
const CODE_DESCRIPTION: string = 'Apple és Samsung készülékek előrendelése. Fizetés személyes átvételkor vagy kiszállításkor. (Mintaáruház)'

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const row = (await db.execute(sql`SELECT "seo_default_title" AS "title", "seo_default_description" AS "description" FROM "store_settings" ORDER BY "id" LIMIT 1`)).rows[0] as
    | { title: string | null; description: string | null }
    | undefined
  if (row) {
    const differs = (row.title ?? '') !== CODE_TITLE || (row.description ?? '') !== CODE_DESCRIPTION
    const message = `Általános SEO (megszűnő beállítás) – cím: ${JSON.stringify(row.title)}; leírás: ${JSON.stringify(row.description)}.`
    if (differs) payload.logger.warn(`${message} Eltér a kódban rögzített értéktől (src/config/seo.ts): ha ez a helyes, másolja át oda.`)
    else payload.logger.info(`${message} Megegyezik a kódban rögzített értékkel.`)
  }
  await db.execute(sql`
   ALTER TABLE "store_settings" DROP COLUMN "seo_default_title";
  ALTER TABLE "store_settings" DROP COLUMN "seo_default_description";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "store_settings" ADD COLUMN "seo_default_title" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "seo_default_description" varchar;`)
  await db.execute(sql`UPDATE "store_settings" SET "seo_default_title" = ${CODE_TITLE}, "seo_default_description" = ${CODE_DESCRIPTION}`)
}
