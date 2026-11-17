import type { Metadata } from 'next'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ContactDetails } from '@/components/contact/ContactDetails'
import { ContactForm } from '@/components/contact/ContactForm'
import { Reveal } from '@/components/Reveal'
import { getStoreSettings } from '@/dto/settings'
import { createFormToken } from '@/lib/form-token'
import { CONTACT_FORM_PURPOSE } from '@/services/contactService'

export const metadata: Metadata = { title: 'Kapcsolat', alternates: { canonical: '/kapcsolat' } }

export default async function ContactPage(): Promise<React.JSX.Element> {
  const settings = await getStoreSettings()
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: 'Kapcsolat' }]} />
      <Reveal>
        <h1 className="text-3xl font-bold sm:text-4xl">Kapcsolat</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Kérdése van egy termékről vagy egy előrendelésről? Írjon nekünk, és a megadott e-mail-címen válaszolunk.</p>
      </Reveal>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="urlap-cim">
          <h2 id="urlap-cim" className="sr-only">
            Kapcsolati űrlap
          </h2>
          <ContactForm formToken={createFormToken(CONTACT_FORM_PURPOSE)} />
        </section>
        <Reveal delay={0.08}>
          <ContactDetails contact={settings.contact} />
        </Reveal>
      </div>
    </div>
  )
}
