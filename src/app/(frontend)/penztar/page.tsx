import type { Metadata } from 'next'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { Reveal } from '@/components/Reveal'
import { getStoreSettings } from '@/dto/settings'

export const metadata: Metadata = { title: 'Pénztár', robots: { index: false, follow: false } }

export default async function CheckoutPage(): Promise<React.JSX.Element> {
  const settings = await getStoreSettings()
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: 'Kosár', href: '/kosar' }, { label: 'Pénztár' }]} />
      <Reveal>
        <h1 className="mb-6 text-3xl font-bold">Pénztár – előrendelés</h1>
      </Reveal>
      <CheckoutForm deliveryMethods={settings.deliveryMethods} collection={settings.collection} />
    </div>
  )
}
