import 'server-only'

import { clock } from '@/lib/clock'
import { hmac, safeEqual } from '@/lib/crypto'

const MIN_FILL_MS: number = 3_000
const MAX_AGE_MS: number = 2 * 60 * 60 * 1000

export type FormTokenCheck = 'ok' | 'too_fast' | 'expired' | 'invalid'

/** Signed render time for public forms. Basic anti-spam: bots tend to submit instantly or replay old pages. */
export function createFormToken(purpose: string): string {
  const issuedAt = String(clock.now().getTime())
  return `${issuedAt}.${hmac(`form:${purpose}:${issuedAt}`)}`
}

export function checkFormToken(purpose: string, token: string): FormTokenCheck {
  const [issuedAt = '', signature = ''] = token.split('.')
  if (!/^\d{1,15}$/.test(issuedAt) || !safeEqual(hmac(`form:${purpose}:${issuedAt}`), signature)) return 'invalid'
  const age = clock.now().getTime() - Number(issuedAt)
  if (age < MIN_FILL_MS) return 'too_fast'
  if (age > MAX_AGE_MS) return 'expired'
  return 'ok'
}
