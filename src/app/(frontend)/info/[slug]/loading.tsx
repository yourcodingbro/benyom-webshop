import type React from 'react'

import { InfoPageLayoutSkeleton } from '@/components/info/InfoPageLayout'

export default function InfoPageLoading(): React.JSX.Element {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Az oldal betöltése…</span>
      <InfoPageLayoutSkeleton />
    </div>
  )
}
