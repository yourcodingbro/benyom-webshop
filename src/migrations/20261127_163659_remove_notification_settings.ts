import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

const SWITCHES: readonly string[] = ['under_review', 'confirmed', 'procurement_in_progress', 'ready_for_collection', 'dispatched', 'completed', 'cancelled']

/**
 * Drops the former Értesítési beállítások table once its switches are in Email beállítások (previous migration).
 * Refuses to run (nothing dropped) if a saved switch value differs there.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const source = (await db.execute(sql`SELECT * FROM "notification_settings" ORDER BY "id" LIMIT 1`)).rows[0] as Record<string, unknown> | undefined
  if (source) {
    const target = (await db.execute(sql`SELECT * FROM "email_settings" ORDER BY "id" LIMIT 1`)).rows[0] as Record<string, unknown> | undefined
    const differs = SWITCHES.filter((name) => `status_emails_${name}` in source && source[`status_emails_${name}`] !== target?.[`status_emails_${name}`])
    if (differs.length > 0) throw new Error(`Az állapotváltási e-mail kapcsolók nincsenek áthelyezve (${differs.join(', ')}); semmit nem töröltünk.`)
  }
  await db.execute(sql`
   DROP TABLE "notification_settings" CASCADE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "notification_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status_emails_under_review" boolean DEFAULT false,
  	"status_emails_confirmed" boolean DEFAULT true,
  	"status_emails_procurement_in_progress" boolean DEFAULT false,
  	"status_emails_ready_for_collection" boolean DEFAULT true,
  	"status_emails_dispatched" boolean DEFAULT true,
  	"status_emails_completed" boolean DEFAULT true,
  	"status_emails_cancelled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  `)
}
