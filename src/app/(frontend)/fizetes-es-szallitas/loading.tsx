import type React from 'react'

import { InfoPageLayoutSkeleton } from '@/components/info/InfoPageLayout'

export default function PaymentAndDeliveryLoading(): React.JSX.Element {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Az oldal betöltése…</span>
      <InfoPageLayoutSkeleton />
    </div>
  )
}
