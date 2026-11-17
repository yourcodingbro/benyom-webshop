import type React from 'react'

import { ContactDetailsSkeleton } from '@/components/contact/ContactDetails'
import { ContactFormSkeleton } from '@/components/contact/ContactForm'
import { Skeleton } from '@/components/shadcn/skeleton'

export default function ContactLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">A kapcsolati oldal betöltése…</span>
      <Skeleton className="mb-4 h-5 w-32" />
      <Skeleton className="h-9 w-48 sm:h-10" />
      {/* The intro wraps to three lines on phones, one on wide screens. */}
      <div className="mt-3 max-w-2xl space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full sm:hidden" />
        <Skeleton className="h-5 w-1/2 sm:hidden" />
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <ContactFormSkeleton />
        <ContactDetailsSkeleton />
      </div>
    </div>
  )
}
