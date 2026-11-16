import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_email_messages_template_id" ADD VALUE 'admin-invitation';
  ALTER TYPE "public"."enum_email_messages_category" ADD VALUE 'admin';
  ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "temporary_password_expires_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "temporary_password_fingerprint" varchar;
  ALTER TABLE "users" ADD COLUMN "last_invitation_email_id" integer;
  ALTER TABLE "users" ADD CONSTRAINT "users_last_invitation_email_id_email_messages_id_fk" FOREIGN KEY ("last_invitation_email_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_last_invitation_email_idx" ON "users" USING btree ("last_invitation_email_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP CONSTRAINT "users_last_invitation_email_id_email_messages_id_fk";
  
  ALTER TABLE "email_messages" ALTER COLUMN "template_id" SET DATA TYPE text;
  DROP TYPE "public"."enum_email_messages_template_id";
  CREATE TYPE "public"."enum_email_messages_template_id" AS ENUM('order-received', 'store-new-order', 'price-change-proposal', 'price-change-reminder', 'price-change-accepted', 'cancelled-after-rejection', 'cancelled-after-timeout', 'cancelled-by-store', 'fulfillment-update', 'contact-message');
  ALTER TABLE "email_messages" ALTER COLUMN "template_id" SET DATA TYPE "public"."enum_email_messages_template_id" USING "template_id"::"public"."enum_email_messages_template_id";
  ALTER TABLE "email_messages" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "public"."enum_email_messages_category";
  CREATE TYPE "public"."enum_email_messages_category" AS ENUM('customer', 'store', 'contact');
  ALTER TABLE "email_messages" ALTER COLUMN "category" SET DATA TYPE "public"."enum_email_messages_category" USING "category"::"public"."enum_email_messages_category";
  DROP INDEX "users_last_invitation_email_idx";
  ALTER TABLE "users" DROP COLUMN "must_change_password";
  ALTER TABLE "users" DROP COLUMN "temporary_password_expires_at";
  ALTER TABLE "users" DROP COLUMN "temporary_password_fingerprint";
  ALTER TABLE "users" DROP COLUMN "last_invitation_email_id";`)
}
