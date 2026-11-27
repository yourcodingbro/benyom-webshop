import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Drops the former location of the preorder steps; refuses (nothing dropped) if the copy is incomplete. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const count = async (table: string): Promise<number> => ((await db.execute(sql`SELECT count(*)::int AS "n" FROM ${sql.identifier(table)}`)).rows[0] as { n: number }).n
  if ((await count('payment_settings_payment_page_process_steps')) > (await count('payment_settings_preorder_steps_process_steps'))) {
    throw new Error('Az előrendelés lépései még nincsenek teljesen áthelyezve; semmit nem töröltünk.')
  }
  await db.execute(sql`
   DROP TABLE "payment_settings_payment_page_process_steps" CASCADE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payment_settings_payment_page_process_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "payment_settings_payment_page_process_steps" ADD CONSTRAINT "payment_settings_payment_page_process_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payment_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payment_settings_payment_page_process_steps_order_idx" ON "payment_settings_payment_page_process_steps" USING btree ("_order");
  CREATE INDEX "payment_settings_payment_page_process_steps_parent_id_idx" ON "payment_settings_payment_page_process_steps" USING btree ("_parent_id");`)
}
