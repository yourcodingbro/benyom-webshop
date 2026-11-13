import { postgresAdapter } from '@payloadcms/db-postgres'
import { s3Storage } from '@payloadcms/storage-s3'
import { hu } from '@payloadcms/translations/languages/hu'
import path from 'path'
import { buildConfig, type Plugin } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Brands } from './collections/Brands'
import { Categories } from './collections/Categories'
import { ContactMessages } from './collections/ContactMessages'
import { EmailEvents } from './collections/EmailEvents'
import { EmailMessages } from './collections/EmailMessages'
import { ImportJobs } from './collections/ImportJobs'
import { Media } from './collections/Media'
import { NotificationSettings } from './collections/NotificationSettings'
import { OrderEvents } from './collections/OrderEvents'
import { Orders } from './collections/Orders'
import { PriceChangeProposals } from './collections/PriceChangeProposals'
import { Products } from './collections/Products'
import { StoreSettings } from './collections/StoreSettings'
import { Users } from './collections/Users'
import { getServerEnv, getStorageEnv } from './config/env'

const filename: string = fileURLToPath(import.meta.url)
const dirname: string = path.dirname(filename)

const env = getServerEnv()
const storage = getStorageEnv(env)

/**
 * Migrations and the import script set PAYLOAD_DB_TARGET=migration (see package.json scripts) to use
 * DATABASE_MIGRATION_URL (direct connection or session pooler). The app uses DATABASE_URL (Supabase
 * transaction pooler on Vercel). node-postgres sends unnamed queries, so no prepared statements are
 * kept across pooled transactions.
 */
const useMigrationConnection: boolean = process.env.PAYLOAD_DB_TARGET === 'migration'
const connectionString: string = useMigrationConnection ? (env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL) : env.DATABASE_URL

const plugins: Plugin[] = storage
  ? [
      s3Storage({
        // Object keys come from the per-document prefix (brand/category/product/[color]); see collections/Media.ts.
        collections: {
          media: {
            prefix: '',
            // Public product images are served straight from Supabase Storage.
            disablePayloadAccessControl: true,
            generateFileURL: ({ filename, prefix }: { filename: string; prefix?: string }): string => `${storage.publicBaseUrl}/${prefix ? `${prefix}/` : ''}${filename}`,
          },
        },
        bucket: storage.bucket,
        config: {
          endpoint: storage.endpoint,
          region: storage.region,
          forcePathStyle: true,
          credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
        },
      }),
    ]
  : []

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' – Webshop admin' },
    components: {
      views: {
        csvImport: { Component: '@/components/admin/CsvImportView#CsvImportView', path: '/termekimport' },
      },
      afterNavLinks: ['@/components/admin/AdminNavLinks#AdminNavLinks'],
    },
  },
  i18n: { supportedLanguages: { hu }, fallbackLanguage: 'hu' },
  collections: [Users, Media, Brands, Categories, Products, Orders, OrderEvents, PriceChangeProposals, EmailMessages, EmailEvents, ContactMessages, ImportJobs],
  globals: [StoreSettings, NotificationSettings],
  secret: env.PAYLOAD_SECRET,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString, max: env.DATABASE_POOL_MAX, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 },
    migrationDir: path.resolve(dirname, 'migrations'),
    // Never auto-push schema changes; every schema change ships as a version-controlled migration.
    push: false,
    // Order, proposal and email state changes run in explicit transactions (see src/dto/payload.ts).
    transactionOptions: { isolationLevel: 'read committed' },
  }),
  sharp,
  plugins,
  upload: { limits: { fileSize: 10_000_000 } },
})
