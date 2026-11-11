import { ChevronRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Reveal } from '@/components/Reveal'
import { getCategories } from '@/dto/categories'

export const metadata: Metadata = { title: 'Összes kategória', alternates: { canonical: '/kategoriak' } }

export default async function CategoriesPage(): Promise<React.JSX.Element> {
  const categories = await getCategories()
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: 'Kategóriák' }]} />
      <h1 className="text-3xl font-bold sm:text-4xl">Összes kategória</h1>
      <Reveal>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.id}>
              <Link href={`/kategoria/${category.slug}`} className="group flex h-full items-start gap-3 rounded-2xl bg-muted p-5 transition-colors hover:bg-secondary/70">
                <span className="flex-1">
                  <span className="font-heading block text-lg font-bold text-ink">{category.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{category.description}</span>
                </span>
                <ChevronRightIcon className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  )
}
