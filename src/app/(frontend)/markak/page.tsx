import { ChevronRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Reveal } from '@/components/Reveal'
import { Button } from '@/components/shadcn/button'
import { catalogService } from '@/services/catalogService'

export const metadata: Metadata = { title: 'Összes márka', alternates: { canonical: '/markak' } }

export default async function BrandsPage(): Promise<React.JSX.Element> {
  const navigation = await catalogService.getNavigation()
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: 'Márkák' }]} />
      <h1 className="text-3xl font-bold sm:text-4xl">Összes márka</h1>
      <Reveal>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {navigation.map((item) => (
            <li key={item.brand.id} className="rounded-2xl border bg-card p-5">
              <h2 className="border-l-4 border-brand-red pl-3 text-xl font-bold">
                <Link href={`/marka/${item.brand.slug}`} className="inline-flex items-center gap-1 hover:underline">
                  {item.brand.name}
                  <ChevronRightIcon className="size-5" aria-hidden="true" />
                </Link>
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.brand.description}</p>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${item.brand.name} kategóriái`}>
                {item.categories.map((category) => (
                  <li key={category.id}>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/marka/${item.brand.slug}/${category.slug}`}>{category.name}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  )
}
