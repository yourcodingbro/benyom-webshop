/**
 * Initial data import: moves the original sample dataset (src/seed/initial-data.ts) into Supabase
 * PostgreSQL through Payload's Local API.
 *
 *   npm run import:initial -- target-database=<database name> [skip-demo] [skip-media] [confirm-production]
 *
 * (Arguments are positional: `payload run` forwards only those; a leading `--` is accepted too.)
 *
 * - Loads the documented local env file (.env.local) through Payload's CLI; uses DATABASE_MIGRATION_URL.
 * - Refuses to run unless target-database=… names the database it is connected to (explicit identification).
 * - Idempotent: stable ids, slugs, SKUs, media object keys and order idempotency keys; a rerun creates
 *   nothing twice and never overwrites or deletes existing records (differences are reported as conflicts).
 * - Demo orders are historical: imported with `isDemo`, no emails, no jobs, no scheduling. Never imported
 *   when APP_ENV=production.
 * - Media are uploaded through the Media collection (Supabase Storage); without storage configuration they
 *   are reported as unavailable, never as uploaded.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { describeDatabaseUrl, getServerEnv, getStorageEnv } from '@/config/env'
import { runInitialImport } from '@/seed/initial-import'

const ARGS: string[] = process.argv.slice(2).map((value: string) => value.replace(/^--/, ''))

function arg(name: string): string | null {
  return ARGS.find((value: string) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null
}

function flag(name: string): boolean {
  return ARGS.includes(name)
}

async function main(): Promise<void> {
  const env = getServerEnv()
  const connection = describeDatabaseUrl(process.env.PAYLOAD_DB_TARGET === 'migration' ? (env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL) : env.DATABASE_URL)
  const target = arg('target-database')
  if (!target || target !== connection.database) {
    console.error(`A cél adatbázist kifejezetten meg kell nevezni: target-database=${connection.database} (kapcsolat: ${connection.host}). Nem futtatjuk.`)
    process.exit(2)
  }
  const production = env.APP_ENV === 'production'
  if (production && !flag('confirm-production')) {
    console.error('APP_ENV=production: éles adatbázisba importálni csak confirm-production argumentummal lehet (demó rendelés ekkor sem kerül át).')
    process.exit(2)
  }
  const skipDemo = production || flag('skip-demo')
  const storageReady = Boolean(getStorageEnv(env)) && !flag('skip-media')
  console.info(`Kezdeti import → ${connection.host}/${connection.database} (APP_ENV=${env.APP_ENV}, médiák: ${storageReady ? 'feltöltés' : 'kihagyva'}, demó rendelések: ${skipDemo ? 'kihagyva' : 'importálás'})`)

  const payload = await getPayload({ config })
  const { counts: report, details, aborted } = await runInitialImport(payload, { skipDemo, storageReady, skipReason: production ? 'Éles környezetben demó rendelés nem importálható.' : 'skip-demo' })

  console.info('\nEredmény (létrehozva / helyreállítva / kihagyva / leképezve / ütközés / sikertelen / nem elérhető):')
  for (const [entity, counts] of Object.entries(report)) {
    console.info(`  ${entity.padEnd(11)} ${counts.created} / ${counts.repaired} / ${counts.skipped} / ${counts.mapped} / ${counts.conflict} / ${counts.failed} / ${counts.unavailable}`)
  }
  const unavailable = details.filter((line: string) => line.includes('unavailable'))
  for (const line of details.filter((item: string) => !item.includes('unavailable'))) console.info(`  ${line}`)
  if (unavailable.length > 0) console.info(`  [media] ${unavailable.length} kép nem lett feltöltve (Supabase Storage nincs beállítva vagy skip-media). Beállítás után futtassa újra az importot: a még kép nélküli termékekhez feltölti és hozzárendeli őket.`)
  const failed = Object.values(report).reduce((sum: number, counts) => sum + counts.failed, 0)
  if (aborted) {
    console.error(`\nAZ IMPORT MEGSZAKADT (közös infrastruktúra- vagy sémahiba, a többi rekordot nem próbáltuk): ${aborted}`)
    console.error('A fenti számok a megszakításig elvégzett munkát mutatják; a hiba javítása után az import biztonságosan újrafuttatható.')
  } else if (failed > 0) {
    console.error(`\nRÉSZLEGES SIKER: ${failed} rekord sikertelen (lásd fent). A hibák javítása után az import újrafuttatható.`)
  } else {
    console.info('\nAz import sikeres.')
  }
  process.exit(aborted ? 3 : failed > 0 ? 1 : 0)
}

await main()
