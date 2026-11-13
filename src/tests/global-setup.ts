import { describeDatabaseUrl } from '@/config/env'

/**
 * Prepares the disposable test database once per run: drops and re-creates the `public` schema,
 * applies the version-controlled migrations, runs the real initial import (catalog, settings,
 * demo orders), creates a test admin and snapshots everything into the `test_snapshot` schema.
 * Each test restores that snapshot (src/tests/helpers.ts) instead of re-seeding.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const url = process.env.DATABASE_URL ?? ''
  const { database } = describeDatabaseUrl(url)
  if (!url || !database.endsWith('_test')) {
    throw new Error(
      'Az integrációs tesztekhez TEST_DATABASE_URL szükséges egy eldobható, "_test" végű adatbázisra (pl. postgresql://postgres@127.0.0.1:5432/benyom_test). A teszt törli és újra létrehozza annak public sémáját.',
    )
  }
  const { getPayload, sql, config, migrations, runInitialImport } = await loadModules()
  const payload = await getPayload({ config })
  const db = payload.db.drizzle
  await db.execute(sql`DROP SCHEMA IF EXISTS test_snapshot CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`)
  await payload.db.migrate({ migrations: migrations as unknown as NonNullable<Parameters<typeof payload.db.migrate>[0]>["migrations"] })
  const report = await runInitialImport(payload, { skipDemo: false, storageReady: false })
  const failed = Object.values(report.counts).reduce((sum: number, counts) => sum + counts.failed, 0)
  if (failed > 0) throw new Error(`A teszt-seed sikertelen: ${report.details.join('; ')}`)
  await payload.create({ collection: 'users', data: { email: 'admin@teszt.hu', password: 'Teszt-jelszo-123456', roles: ['admin'] }, overrideAccess: true })
  await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })

  const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'payload_migrations'`)
  await db.execute(sql`CREATE SCHEMA test_snapshot`)
  for (const row of tables.rows as { tablename: string }[]) {
    await db.execute(sql.raw(`CREATE TABLE test_snapshot."${row.tablename}" AS TABLE public."${row.tablename}"`))
  }
  await payload.db.destroy?.()
  return async (): Promise<void> => undefined
}

async function loadModules(): Promise<{
  getPayload: typeof import('payload').getPayload
  sql: typeof import('@payloadcms/db-postgres').sql
  config: Awaited<typeof import('@payload-config').default>
  migrations: typeof import('@/migrations').migrations
  runInitialImport: typeof import('@/seed/initial-import').runInitialImport
}> {
  const [{ getPayload }, { sql }, configModule, { migrations }, { runInitialImport }] = await Promise.all([
    import('payload'),
    import('@payloadcms/db-postgres'),
    import('@payload-config'),
    import('@/migrations'),
    import('@/seed/initial-import'),
  ])
  return { getPayload, sql, config: await configModule.default, migrations, runInitialImport }
}
