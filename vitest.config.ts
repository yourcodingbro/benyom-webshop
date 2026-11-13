import { randomBytes } from 'node:crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const dirname: string = path.dirname(fileURLToPath(import.meta.url))

/*
 * Integration tests run against a real PostgreSQL database through Payload (no mocks of the data
 * layer). TEST_DATABASE_URL must point to a disposable database whose name ends in `_test`; the global
 * setup drops and re-migrates its `public` schema. The test environment is fixed here so a developer's
 * .env/.env.local (e.g. a real Resend key) can never be used: email always starts in log mode and the
 * Resend SDK is mocked where a test needs "resend" mode.
 */
const testDatabaseUrl: string = process.env.TEST_DATABASE_URL ?? ''
Object.assign(process.env, {
  APP_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  DATABASE_MIGRATION_URL: '',
  DATABASE_POOL_MAX: '5',
  PAYLOAD_SECRET: randomBytes(32).toString('hex'),
  APP_SIGNING_SECRET: randomBytes(32).toString('hex'),
  EMAIL_MODE: 'log',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  CONTACT_EMAIL: '',
  CRON_SECRET: 'test-cron-secret-0123456789',
  RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from('teszt-webhook-titok-0123456789').toString('base64')}`,
  SUPABASE_URL: '',
  SUPABASE_STORAGE_BUCKET: '',
  SUPABASE_S3_ENDPOINT: '',
  SUPABASE_S3_REGION: '',
  SUPABASE_S3_ACCESS_KEY_ID: '',
  SUPABASE_S3_SECRET_ACCESS_KEY: '',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
})

export default defineConfig({
  resolve: {
    alias: {
      '@payload-config': path.resolve(dirname, 'src/payload.config.ts'),
      '@': path.resolve(dirname, 'src'),
      'server-only': path.resolve(dirname, 'src/tests/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/tests/global-setup.ts'],
    // One shared database: test files run one after another.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
