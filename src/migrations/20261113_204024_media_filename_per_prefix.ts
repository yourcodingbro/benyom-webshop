import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "media_filename_idx";
  CREATE UNIQUE INDEX "media_filename_compound_idx" ON "media" USING btree ("filename","prefix");
  CREATE INDEX "media_filename_idx" ON "media" USING btree ("filename");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "media_filename_compound_idx";
  DROP INDEX "media_filename_idx";
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");`)
}
