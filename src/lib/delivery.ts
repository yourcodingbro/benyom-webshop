import { formatHuf } from '@/lib/format'
import type { DeliveryFee } from '@/types/settings'

/** Customer-facing fee text. */
export function describeDeliveryFee(fee: DeliveryFee): string {
  return fee.kind === 'free' ? 'Ingyenes' : formatHuf(fee.amount)
}
