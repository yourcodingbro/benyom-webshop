import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_email_messages_template_id" ADD VALUE 'payload-native';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Email history is never deleted to make the rollback fit.
  const used = (await db.execute(sql`SELECT count(*)::int AS "n" FROM "email_messages" WHERE "template_id"::text = 'payload-native'`)).rows[0] as { n: number }
  if (used.n > 0) throw new Error(`${used.n} e-mail-előzmény a „payload-native” sablont használja; a visszaállítás ezeket nem törli, ezért leáll.`)
  await db.execute(sql`
   ALTER TABLE "email_messages" ALTER COLUMN "template_id" SET DATA TYPE text;
  DROP TYPE "public"."enum_email_messages_template_id";
  CREATE TYPE "public"."enum_email_messages_template_id" AS ENUM('order-received', 'store-new-order', 'price-change-proposal', 'price-change-reminder', 'price-change-accepted', 'cancelled-after-rejection', 'cancelled-after-timeout', 'cancelled-by-store', 'fulfillment-update', 'contact-message', 'admin-invitation');
  ALTER TABLE "email_messages" ALTER COLUMN "template_id" SET DATA TYPE "public"."enum_email_messages_template_id" USING "template_id"::"public"."enum_email_messages_template_id";`)
}
