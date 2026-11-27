import type { CartLimits } from '@/types/settings'

/**
 * The configured business limits (Áruház beállítások → Üzleti szabályok) for a cart or an order being placed. The
 * static request schemas only cap at TECHNICAL_LIMITS; this is the business check. Existing orders are never
 * re-checked, so lowering a limit does not change them. Returns the customer-facing message, or null when allowed.
 */
export function cartLimitError(lines: readonly { quantity: number }[], limits: CartLimits): string | null {
  if (lines.length > limits.maxCartLines) return `Legfeljebb ${limits.maxCartLines} tétel lehet a kosárban.`
  if (lines.some((line) => line.quantity > limits.maxLineQuantity)) return `Tételenként legfeljebb ${limits.maxLineQuantity} darab rendelhető.`
  return null
}
