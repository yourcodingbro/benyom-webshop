import { formatHuf } from '@/lib/format'
import type { DeliveryFee } from '@/types/settings'

/** Customer-facing fee text. Unknown is never shown as free. */
export function describeDeliveryFee(fee: DeliveryFee): string {
  if (fee.kind === 'free') return 'Ingyenes'
  if (fee.kind === 'fixed') return formatHuf(fee.amount)
  return 'Díj még nincs meghatározva – nem választható'
}
