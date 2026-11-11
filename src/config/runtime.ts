import 'server-only'

/**
 * Runtime flags. Read lazily so tests and dev tooling see the current environment.
 * Everything in this project currently runs in sample mode (no database).
 */
export function isProductionDeployment(): boolean {
  return process.env.APP_ENV === 'production' || process.env.VERCEL_ENV === 'production'
}

/** Sample checkout writes only to process memory; it must never accept real customers. */
export function isSampleCheckoutEnabled(): boolean {
  return !isProductionDeployment()
}

/** Clock, scheduler, email-failure, CSV and reset tools. */
export function areDevToolsEnabled(): boolean {
  if (isProductionDeployment()) return false
  return process.env.NODE_ENV === 'development' || process.env.ENABLE_SAMPLE_DEV_TOOLS === 'true'
}

/** Payload admin/API need a database; without it those routes answer 503. */
export function isPayloadConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.PAYLOAD_SECRET)
}

/** Sample deployments must never be indexed. */
export function isIndexingAllowed(): boolean {
  return isProductionDeployment() && process.env.ALLOW_INDEXING === 'true'
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}
