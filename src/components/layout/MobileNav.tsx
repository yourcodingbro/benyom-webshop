'use client'

import { MenuIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { SearchForm } from '@/components/layout/SearchForm'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/shadcn/sheet'

export type NavigationEntry = {
  brandName: string
  brandSlug: string
  categories: { name: string; slug: string }[]
}

type MobileNavProps = {
  navigation: NavigationEntry[]
}

export function MobileNav(props: MobileNavProps): React.JSX.Element {
  return (
    <Sheet>
      <SheetTrigger className="flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden" aria-label="Menü megnyitása">
        <MenuIcon className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto bg-ink text-white">
        <SheetHeader>
          <SheetTitle className="text-white">Menü</SheetTitle>
          <SheetDescription className="text-white/70">Márkák és kategóriák</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <SearchForm id="mobil-kereses" className="mb-6" />
          <nav aria-label="Mobil navigáció">
            <SheetClose asChild>
              <Link href="/termekek" className="block rounded-md px-2 py-2 font-semibold hover:bg-white/10">
                Összes termék
              </Link>
            </SheetClose>
            {props.navigation.map((entry: NavigationEntry) => (
              <div key={entry.brandSlug} className="mt-4">
                <SheetClose asChild>
                  <Link href={`/marka/${entry.brandSlug}`} className="block border-l-4 border-brand-red px-2 py-1 font-heading font-bold">
                    {entry.brandName}
                  </Link>
                </SheetClose>
                <ul className="mt-1 ml-3">
                  {entry.categories.map((category) => (
                    <li key={category.slug}>
                      <SheetClose asChild>
                        <Link href={`/marka/${entry.brandSlug}/${category.slug}`} className="block rounded-md px-2 py-2 text-white/85 hover:bg-white/10">
                          {category.name}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  )
}
