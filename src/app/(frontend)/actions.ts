'use server'

import { cookies } from 'next/headers'

import { ORDER_ACCESS_COOKIE } from '@/config/shop'
import { isAppError } from '@/lib/errors'
import { cartLinesSchema } from '@/schemas/common'
import { orderService } from '@/services/orderService'
import { quoteService } from '@/services/quoteService'
import type { CartQuote } from '@/types/cart'
import type { FieldErrors } from '@/types/common'

export type QuoteCartActionResult = { ok: true; quote: CartQuote } | { ok: false; message: string }

export type PlaceOrderActionResult = { ok: true; reference: string } | { ok: false; message: string; fieldErrors: FieldErrors }

/** Server-side pricing for the browser cart. Browser-supplied prices are never accepted. */
export async function quoteCartAction(lines: unknown): Promise<QuoteCartActionResult> {
  const parsed = cartLinesSchema.safeParse(lines)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Érvénytelen kosár.' }
  return { ok: true, quote: await quoteService.quoteCart(parsed.data) }
}

/** Submits a preorder. On success an httpOnly cookie lets this browser view its confirmation. */
export async function placeOrderAction(input: unknown): Promise<PlaceOrderActionResult> {
  try {
    const result = await orderService.placeOrder(input)
    if (!result.ok) return result
    const store = await cookies()
    store.set(ORDER_ACCESS_COOKIE, `${result.reference}.${result.accessToken}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/rendeles',
      maxAge: 60 * 60 * 24,
    })
    return { ok: true, reference: result.reference }
  } catch (error: unknown) {
    if (isAppError(error)) return { ok: false, message: error.message, fieldErrors: {} }
    console.error('[RENDELÉS] Váratlan hiba', error instanceof Error ? error.message : 'ismeretlen')
    return { ok: false, message: 'Váratlan hiba történt. A rendelést nem rögzítettük – kérjük, próbálja újra.', fieldErrors: {} }
  }
}
