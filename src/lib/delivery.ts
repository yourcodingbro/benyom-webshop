import { formatHuf } from '@/lib/format'
import type { DeliveryFee } from '@/types/settings'

/** Customer-facing fee text. Unknown is never shown as free; sample fees are labelled as fictional. */
export function describeDeliveryFee(fee: DeliveryFee): string {
  if (fee.kind === 'free') return 'Ingyenes'
  if (fee.kind === 'fixed') return `${formatHuf(fee.amount)}${fee.isSampleValue ? ' (fiktív mintadíj)' : ''}`
  return 'Díj még nincs meghatározva – nem választható'
}
