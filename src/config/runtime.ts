import 'server-only'

import { getAppEnv } from '@/config/env'

/** Runtime flags derived from the validated, server-side APP_ENV (never NODE_ENV). */
export function isProductionDeployment(): boolean {
  return getAppEnv() === 'production'
}

/**
 * Development tools (/fejlesztes) exist only when APP_ENV is valid and not `production`. A missing or
 * invalid APP_ENV fails closed: the tools stay hidden and the problem is logged.
 */
export function areDevToolsEnabled(): boolean {
  try {
    return getAppEnv() !== 'production'
  } catch (error: unknown) {
    console.error('[KONFIGURÁCIÓ] A fejlesztői eszközök letiltva:', error instanceof Error ? error.message.split('\n')[0] : 'érvénytelen APP_ENV')
    return false
  }
}

/** Only a live production deployment with ALLOW_INDEXING=true may be indexed. */
export function isIndexingAllowed(): boolean {
  return isProductionDeployment() && process.env.ALLOW_INDEXING === 'true'
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}
