import { MailIcon, MapPinIcon, PhoneIcon } from 'lucide-react'
import type React from 'react'

import { Skeleton } from '@/components/shadcn/skeleton'
import type { StoreSettings } from '@/types/settings'

type ContactDetailsProps = {
  contact: StoreSettings['contact']
}

/** "Elérhetőségek" box next to the contact form (public store contact details). */
export function ContactDetails(props: ContactDetailsProps): React.JSX.Element {
  return (
    <aside className="space-y-4 rounded-xl bg-muted p-5 text-sm" aria-labelledby="elerhetosegek">
      <h2 id="elerhetosegek" className="text-base font-bold">
        Elérhetőségek
      </h2>
      <p className="flex items-start gap-2">
        <MailIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">E-mail: </span>
          {props.contact.email}
        </span>
      </p>
      <p className="flex items-start gap-2">
        <PhoneIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">Telefon: </span>
          {props.contact.phone}
        </span>
      </p>
      <p className="flex items-start gap-2">
        <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">Cím: </span>
          {props.contact.address}
        </span>
      </p>
    </aside>
  )
}

/** ContactDetails placeholder: heading and the three icon + text rows. */
export function ContactDetailsSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4 rounded-xl bg-muted p-5" aria-hidden="true">
      <Skeleton className="h-6 w-32 bg-background/70" />
      {['w-44', 'w-36', 'w-52'].map((width: string) => (
        <div key={width} className="flex items-start gap-2">
          <Skeleton className="mt-0.5 size-4 shrink-0 bg-background/70" />
          <Skeleton className={`h-5 ${width} bg-background/70`} />
        </div>
      ))}
    </div>
  )
}
