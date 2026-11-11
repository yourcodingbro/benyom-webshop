import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { isProductionDeployment } from '@/config/runtime'

const SECRET_KEY: unique symbol = Symbol.for('benyom.devSigningSecret')
type SecretGlobal = typeof globalThis & { [SECRET_KEY]?: string }

/**
 * HMAC secret for quotes and order-access tokens. In sample mode a random
 * per-process secret is used when none is configured (tokens die on restart).
 */
function signingSecret(): string {
  const configured = process.env.APP_SIGNING_SECRET
  if (configured && configured.length >= 32) return configured
  if (isProductionDeployment()) throw new Error('APP_SIGNING_SECRET hiányzik vagy túl rövid (min. 32 karakter).')
  const holder = globalThis as SecretGlobal
  holder[SECRET_KEY] ??= randomBytes(32).toString('hex')
  return holder[SECRET_KEY]
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
