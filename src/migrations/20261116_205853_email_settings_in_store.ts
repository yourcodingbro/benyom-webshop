import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "store_settings" ALTER COLUMN "store_notification_email" DROP NOT NULL;
  ALTER TABLE "store_settings" ALTER COLUMN "contact_recipient_email" DROP NOT NULL;
  ALTER TABLE "store_settings" ADD COLUMN "store_contact_email" varchar;
  ALTER TABLE "store_settings" ADD COLUMN "email_from" varchar;`)
  const result = await importEmailSettingsFromEnv(db, process.env)
  // Sources only; the values themselves are never logged.
  payload.logger.info(`E-mail beállítások: kapcsolati e-mail – ${result.contact}, feladó – ${result.from}.`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "store_settings" ALTER COLUMN "store_notification_email" SET NOT NULL;
  ALTER TABLE "store_settings" ALTER COLUMN "contact_recipient_email" SET NOT NULL;
  ALTER TABLE "store_settings" DROP COLUMN "store_contact_email";
  ALTER TABLE "store_settings" DROP COLUMN "email_from";`)
}

type ImportSource = {
  contact: 'megtartva' | 'CONTACT_EMAIL' | 'korábbi kapcsolati címzett' | 'nincs'
  from: 'megtartva' | 'EMAIL_FROM' | 'EMAIL_FROM érvénytelen, kihagyva' | 'nincs'
}

const EMAIL: RegExp = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const SENDER: RegExp = /^(?:[^<>]{1,100}<([^<>\s]+)>|([^<>\s]+))$/

function validSender(value: string): boolean {
  const match = SENDER.exec(value)
  return EMAIL.test(match?.[1] ?? match?.[2] ?? '')
}

/**
 * One-time import of the former CONTACT_EMAIL / EMAIL_FROM environment variables into the store
 * settings. Only empty settings are filled; a configured value is never overwritten. Without a valid
 * CONTACT_EMAIL the previous contact-form recipient is used, so store notifications keep a recipient.
 */
export async function importEmailSettingsFromEnv(db: MigrateUpArgs['db'], env: Record<string, string | undefined>): Promise<ImportSource> {
  const row = (await db.execute(sql`SELECT "id", "store_contact_email", "email_from", "contact_recipient_email" FROM "store_settings" LIMIT 1`)).rows[0] as
    | { id: number; store_contact_email: string | null; email_from: string | null; contact_recipient_email: string | null }
    | undefined
  if (!row) return { contact: 'nincs', from: 'nincs' }
  const envContact = (env.CONTACT_EMAIL ?? '').trim()
  const envFrom = (env.EMAIL_FROM ?? '').trim()
  const previous = (row.contact_recipient_email ?? '').trim()

  let contact: ImportSource['contact'] = 'nincs'
  if (row.store_contact_email?.trim()) contact = 'megtartva'
  else {
    const value = EMAIL.test(envContact) ? envContact : EMAIL.test(previous) ? previous : null
    if (value) {
      await db.execute(sql`UPDATE "store_settings" SET "store_contact_email" = ${value} WHERE "id" = ${row.id} AND COALESCE("store_contact_email", '') = ''`)
      contact = value === envContact ? 'CONTACT_EMAIL' : 'korábbi kapcsolati címzett'
    }
  }

  let from: ImportSource['from'] = 'nincs'
  if (row.email_from?.trim()) from = 'megtartva'
  else if (envFrom && !validSender(envFrom)) from = 'EMAIL_FROM érvénytelen, kihagyva'
  else if (envFrom) {
    await db.execute(sql`UPDATE "store_settings" SET "email_from" = ${envFrom} WHERE "id" = ${row.id} AND COALESCE("email_from", '') = ''`)
    from = 'EMAIL_FROM'
  }
  return { contact, from }
}
