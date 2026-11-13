import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The order audit trail is append-only at the database level too: any UPDATE or DELETE of an
 * `order_events` row raises an error, whatever the client (Payload, SQL console, scripts).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION order_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'A rendelési napló (order_events) csak bővíthető; módosítás és törlés nem engedélyezett.';
    END;
    $$;
    CREATE TRIGGER order_events_append_only
      BEFORE UPDATE OR DELETE ON "order_events"
      FOR EACH ROW EXECUTE FUNCTION order_events_append_only();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS order_events_append_only ON "order_events";
    DROP FUNCTION IF EXISTS order_events_append_only();
  `)
}
