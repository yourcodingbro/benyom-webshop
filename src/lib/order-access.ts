import 'server-only'

import { hmac, safeEqual } from '@/lib/crypto'

/** Signed bearer token that lets the submitting browser view its own confirmation page. */
export function createOrderAccessToken(reference: string): string {
  return hmac(`order-access:${reference}`)
}

export function verifyOrderAccessToken(reference: string, token: string): boolean {
  return safeEqual(createOrderAccessToken(reference), token)
}
