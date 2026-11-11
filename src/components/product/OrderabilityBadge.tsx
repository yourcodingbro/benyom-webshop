import type React from 'react'

import { Badge } from '@/components/shadcn/badge'
import { ORDERABILITY_LABELS } from '@/config/labels'
import { cn } from '@/lib/utils'
import type { Orderability } from '@/types/catalog'

type OrderabilityBadgeProps = {
  orderability: Orderability
  className?: string
}

const STYLES: Record<Orderability, string> = {
  preorderable: 'border-emerald-700/30 bg-emerald-50 text-emerald-800',
  temporarily_unavailable: 'border-amber-700/30 bg-amber-50 text-amber-900',
  discontinued: 'border-neutral-400 bg-neutral-100 text-neutral-700',
}

/** Orderability only – never a stock quantity. */
export function OrderabilityBadge(props: OrderabilityBadgeProps): React.JSX.Element {
  return (
    <Badge variant="outline" className={cn(STYLES[props.orderability], props.className)}>
      {ORDERABILITY_LABELS[props.orderability]}
    </Badge>
  )
}
