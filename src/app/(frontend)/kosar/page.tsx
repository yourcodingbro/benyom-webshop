import type { Metadata } from 'next'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CartPageContent } from '@/components/cart/CartPageContent'

export const metadata: Metadata = { title: 'Kosár', robots: { index: false, follow: false } }

export default function CartPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: 'Kosár' }]} />
      <h1 className="mb-6 text-3xl font-bold">Kosár</h1>
      <CartPageContent />
    </div>
  )
}
