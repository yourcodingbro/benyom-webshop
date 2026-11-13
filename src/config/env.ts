import { z } from 'zod'

/**
 * Central, typed server environment. Read lazily (tests and CLI scripts see the current values) and
 * validated as a whole, so a missing or malformed value fails with one clear message instead of a
 * half-configured app. Never import this from client components: nothing here may reach a browser.
 *
 * Values are never logged. Error messages name the variable, never its value.
 */

export const APP_ENVS = ['development', 'test', 'preview', 'production'] as const
export type AppEnv = (typeof APP_ENVS)[number]

const postgresUrl = z
  .string()
  .trim()
  .refine((value: string) => /^postgres(ql)?:\/\/.+/.test(value), 'PostgreSQL kapcsolati URL szükséges (postgresql://…).')

const optional = (schema: z.ZodType<string>): z.ZodType<string | undefined, unknown> => z.preprocess((value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional())

const serverEnvSchema = z.object({
  APP_ENV: z.enum(APP_ENVS, { error: `APP_ENV kötelező: ${APP_ENVS.join(' | ')}.` }),
  /** Runtime connection. On Vercel: Supabase shared pooler, transaction mode (port 6543). */
  DATABASE_URL: postgresUrl,
  /** Migrations and the import script: direct connection or session pooler (port 5432). Falls back to DATABASE_URL. */
  DATABASE_MIGRATION_URL: optional(postgresUrl),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET legalább 32 karakter legyen.'),
  APP_SIGNING_SECRET: z.string().min(32, 'APP_SIGNING_SECRET legalább 32 karakter legyen.'),
  /** Supabase project URL, e.g. https://<project-ref>.supabase.co (public object URLs are built from it). */
  SUPABASE_URL: optional(z.url({ error: 'SUPABASE_URL érvényes https URL legyen.' })),
  SUPABASE_STORAGE_BUCKET: optional(z.string().regex(/^[a-z0-9][a-z0-9._-]{1,62}$/, 'SUPABASE_STORAGE_BUCKET érvénytelen.')),
  /** S3 endpoint from Storage → S3 configuration, e.g. https://<project-ref>.storage.supabase.co/storage/v1/s3 */
  SUPABASE_S3_ENDPOINT: optional(z.url({ error: 'SUPABASE_S3_ENDPOINT érvényes URL legyen.' })),
  SUPABASE_S3_REGION: optional(z.string().min(1)),
  SUPABASE_S3_ACCESS_KEY_ID: optional(z.string().min(1)),
  SUPABASE_S3_SECRET_ACCESS_KEY: optional(z.string().min(1)),
  /** Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. */
  CRON_SECRET: optional(z.string().min(16, 'CRON_SECRET legalább 16 karakter legyen.')),
  /** Resend webhook signing secret (whsec_…). */
  RESEND_WEBHOOK_SECRET: optional(z.string().min(10)),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

export type StorageEnv = {
  publicBaseUrl: string
  bucket: string
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

const STORAGE_KEYS = ['SUPABASE_URL', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_S3_ENDPOINT', 'SUPABASE_S3_REGION', 'SUPABASE_S3_ACCESS_KEY_ID', 'SUPABASE_S3_SECRET_ACCESS_KEY'] as const
/** Privileged values that must never be exposed to the browser. */
const SECRET_KEYS = ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'PAYLOAD_SECRET', 'APP_SIGNING_SECRET', 'SUPABASE_S3_SECRET_ACCESS_KEY', 'SUPABASE_S3_ACCESS_KEY_ID', 'CRON_SECRET', 'RESEND_WEBHOOK_SECRET', 'RESEND_API_KEY']

export class EnvError extends Error {
  constructor(problems: string[]) {
    super(`Hibás vagy hiányzó környezeti beállítás:\n- ${problems.join('\n- ')}\nLásd .env.example és docs/deployment.md.`)
    this.name = 'EnvError'
  }
}

function collectProblems(env: NodeJS.ProcessEnv): { value: ServerEnv | null; problems: string[] } {
  const problems: string[] = []
  for (const key of SECRET_KEYS) {
    if (env[`NEXT_PUBLIC_${key}`]) problems.push(`NEXT_PUBLIC_${key} nem használható: titkos érték nem kerülhet a böngészőbe.`)
  }
  for (const key of ['SUPABASE_STORAGE_BUCKET', 'SUPABASE_S3_ENDPOINT']) {
    if (env[`NEXT_PUBLIC_${key}`]) problems.push(`NEXT_PUBLIC_${key} nem használható.`)
  }
  const parsed = serverEnvSchema.safeParse(env)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join('.') || 'env'}: ${issue.message}`)
    return { value: null, problems }
  }
  const value = parsed.data
  const storageSet = STORAGE_KEYS.filter((key) => value[key] !== undefined)
  if (storageSet.length > 0 && storageSet.length < STORAGE_KEYS.length) {
    problems.push(`A Supabase Storage beállítása hiányos; hiányzik: ${STORAGE_KEYS.filter((key) => value[key] === undefined).join(', ')}.`)
  }
  if (value.APP_ENV === 'production') {
    if (storageSet.length < STORAGE_KEYS.length) problems.push('Éles környezetben a Supabase Storage beállítása kötelező (SUPABASE_* változók).')
    if (!value.CRON_SECRET) problems.push('Éles környezetben a CRON_SECRET kötelező (ütemezett feldolgozás).')
  }
  return { value, problems }
}

/** Validated server environment. Throws EnvError listing every problem (names only, never values). */
export function getServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const { value, problems } = collectProblems(env)
  if (!value || problems.length > 0) throw new EnvError(problems)
  return value
}

export function getAppEnv(): AppEnv {
  const raw = process.env.APP_ENV
  if (!raw || !(APP_ENVS as readonly string[]).includes(raw)) {
    throw new EnvError([`APP_ENV kötelező: ${APP_ENVS.join(' | ')}.`])
  }
  return raw as AppEnv
}

/** Supabase Storage settings, or null when storage is not configured (allowed outside production only). */
export function getStorageEnv(env: ServerEnv = getServerEnv()): StorageEnv | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_STORAGE_BUCKET || !env.SUPABASE_S3_ENDPOINT || !env.SUPABASE_S3_REGION || !env.SUPABASE_S3_ACCESS_KEY_ID || !env.SUPABASE_S3_SECRET_ACCESS_KEY) {
    return null
  }
  return {
    publicBaseUrl: `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}`,
    bucket: env.SUPABASE_STORAGE_BUCKET,
    endpoint: env.SUPABASE_S3_ENDPOINT,
    region: env.SUPABASE_S3_REGION,
    accessKeyId: env.SUPABASE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.SUPABASE_S3_SECRET_ACCESS_KEY,
  }
}

/** Host and database name only, for logs and safety checks; never credentials. */
export function describeDatabaseUrl(url: string): { host: string; database: string } {
  try {
    const parsed = new URL(url)
    return { host: `${parsed.hostname}:${parsed.port || '5432'}`, database: parsed.pathname.replace(/^\//, '') }
  } catch {
    return { host: 'ismeretlen', database: 'ismeretlen' }
  }
}
