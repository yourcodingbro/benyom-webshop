import { postgresAdapter } from '@payloadcms/db-postgres'
import { hu } from '@payloadcms/translations/languages/hu'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Brands } from './collections/Brands'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Orders } from './collections/Orders'
import { PriceChangeProposals } from './collections/PriceChangeProposals'
import { Products } from './collections/Products'
import { StoreSettings } from './collections/StoreSettings'
import { Users } from './collections/Users'

const filename: string = fileURLToPath(import.meta.url)
const dirname: string = path.dirname(filename)

/**
 * Payload configuration – prepared, not active in sample mode.
 *
 * Building this config does not open a database connection; Payload connects only when
 * initialized. Without DATABASE_URL and PAYLOAD_SECRET, `src/proxy.ts` answers /admin and
 * /api with an explicit 503 so Payload is never initialized. No storage adapter, email
 * adapter or ecommerce plugin is configured (see docs/deployment.md).
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' – Webshop admin' },
  },
  i18n: { supportedLanguages: { hu }, fallbackLanguage: 'hu' },
  collections: [Users, Media, Brands, Categories, Products, Orders, PriceChangeProposals],
  globals: [StoreSettings],
  secret: process.env.PAYLOAD_SECRET ?? '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    // Supabase: use the pooled connection string (Supavisor, transaction mode) on Vercel.
    pool: { connectionString: process.env.DATABASE_URL ?? '', max: 5 },
    migrationDir: path.resolve(dirname, 'migrations'),
    // Never auto-push schema changes; use migrations.
    push: false,
  }),
  sharp,
  plugins: [],
})
