import 'server-only'

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

import { getServerEnv } from '@/config/env'

/** HMAC secret for quotes, order-access and decision tokens (validated: at least 32 characters). */
function signingSecret(): string {
  return getServerEnv().APP_SIGNING_SECRET
}

export function randomToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmac(value: string): string {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Readable, non-sequential reference such as BNY-7K3Q-9XHD (no 0/O/1/I). */
export function randomReference(prefix: string = 'BNY'): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const bytes = randomBytes(8)
  const chars = Array.from(bytes, (byte: number) => alphabet[byte % alphabet.length] ?? 'X').join('')
  return `${prefix}-${chars.slice(0, 4)}-${chars.slice(4)}`
}

/** Deterministic JSON for hashing (sorted keys). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const TEMP_PASSWORD_GROUPS: readonly string[] = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#%+=?@']

/**
 * Cryptographically random temporary password (20 characters, no look-alike characters) with at least
 * one character from every group, so it satisfies the password policy.
 */
export function generateTemporaryPassword(length: number = 20): string {
  const all = TEMP_PASSWORD_GROUPS.join('')
  const chars = TEMP_PASSWORD_GROUPS.map((group: string) => group[randomInt(group.length)] ?? 'x')
  while (chars.length < length) chars.push(all[randomInt(all.length)] ?? 'x')
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1)
    ;[chars[index], chars[swap]] = [chars[swap] ?? 'x', chars[index] ?? 'x']
  }
  return chars.join('')
}
