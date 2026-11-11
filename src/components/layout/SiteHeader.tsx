import { ChevronDownIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { CartDrawer } from '@/components/cart/CartDrawer'
import { Logo } from '@/components/Logo'
import { MobileNav, type NavigationEntry } from '@/components/layout/MobileNav'
import { SearchForm } from '@/components/layout/SearchForm'
import type { BrandNavigationItem } from '@/services/catalogService'

type SiteHeaderProps = {
  storeName: string
  navigation: BrandNavigationItem[]
}

/** Dark sticky header (benyom.hu style). Desktop brand menus open on hover and keyboard focus without JS. */
export function SiteHeader(props: SiteHeaderProps): React.JSX.Element {
  const mobileNavigation: NavigationEntry[] = props.navigation.map((item: BrandNavigationItem) => ({
    brandName: item.brand.name,
    brandSlug: item.brand.slug,
    categories: item.categories.map((category) => ({ name: category.name, slug: category.slug })),
  }))

  return (
    <header className="sticky top-0 z-40 bg-ink text-white shadow-md">
      <a href="#tartalom" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink">
        Ugrás a tartalomra
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <MobileNav navigation={mobileNavigation} />
        <Logo storeName={props.storeName} />
        <nav aria-label="Fő navigáció" className="ml-6 hidden lg:block">
          <ul className="flex items-center gap-1">
            {props.navigation.map((item: BrandNavigationItem) => (
              <li key={item.brand.id} className="group relative">
                <Link href={`/marka/${item.brand.slug}`} className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/10">
                  {item.brand.name}
                  <ChevronDownIcon className="size-3.5 opacity-70" aria-hidden="true" />
                </Link>
                <ul className="invisible absolute top-full left-0 z-50 min-w-52 translate-y-1 rounded-lg bg-white p-2 text-ink opacity-0 shadow-xl transition duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  {item.categories.map((category) => (
                    <li key={category.id}>
                      <Link href={`/marka/${item.brand.slug}/${category.slug}`} className="block rounded-md px-3 py-2 text-sm hover:bg-muted">
                        {item.brand.name} {category.name.toLowerCase()}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            <li>
              <Link href="/termekek" className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/10">
                Összes termék
              </Link>
            </li>
          </ul>
        </nav>
        <SearchForm id="fejlec-kereses" className="ml-auto hidden w-56 md:block xl:w-72" />
        <div className="ml-auto md:ml-2">
          <CartDrawer />
        </div>
      </div>
    </header>
  )
}
