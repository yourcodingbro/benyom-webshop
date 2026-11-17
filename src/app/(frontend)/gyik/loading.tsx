import type React from 'react'

import { FaqAccordionSkeleton } from '@/components/info/FaqAccordion'
import { InfoPageLayoutSkeleton } from '@/components/info/InfoPageLayout'

export default function FaqLoading(): React.JSX.Element {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">A gyakori kérdések betöltése…</span>
      <InfoPageLayoutSkeleton>
        <FaqAccordionSkeleton />
      </InfoPageLayoutSkeleton>
    </div>
  )
}
