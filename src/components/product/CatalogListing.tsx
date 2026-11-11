import { SlidersHorizontalIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { type BreadcrumbEntry, Breadcrumbs } from '@/components/Breadcrumbs'
import { ListingFilters } from '@/components/product/ListingFilters'
import { Pagination } from '@/components/product/Pagination'
import { ProductCard } from '@/components/product/ProductCard'
import { Reveal } from '@/components/Reveal'
import { Button } from '@/components/shadcn/button'
import { getBrands } from '@/dto/brands'
import { getCategories } from '@/dto/categories'
import { getProducts } from '@/dto/products'
import type { Brand, Product, ProductQuery } from '@/types/catalog'

type CatalogListingProps = {
  title: string
  description: string | null
  basePath: string
  breadcrumbs: BreadcrumbEntry[]
  query: ProductQuery
  /** Brand/category fixed by the route (not shown as filters). */
  lockBrand?: boolean
  lockCategory?: boolean
  /** Quick links (e.g. categories of a brand). */
  chips?: { label: string; href: string }[]
}

/** Server-rendered listing shared by /termekek, brand, category and brand+category pages. */
export async function CatalogListing(props: CatalogListingProps): Promise<React.JSX.Element> {
  const [result, brands, categories] = await Promise.all([getProducts(props.query), getBrands(), getCategories()])
  const brandsById = new Map(brands.map((brand: Brand) => [brand.id, brand]))
  const omit: ('brand' | 'category')[] = [...(props.lockBrand ? ['brand' as const] : []), ...(props.lockCategory ? ['category' as const] : [])]
  const filterProps = {
    action: props.basePath,
    query: props.query,
    facets: result.facets,
    brands,
    categories,
    lockBrand: props.lockBrand ?? false,
    lockCategory: props.lockCategory ?? false,
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={props.breadcrumbs} />
      <Reveal>
        <h1 className="text-3xl font-bold sm:text-4xl">{props.title}</h1>
        {props.description ? <p className="mt-2 max-w-2xl text-muted-foreground">{props.description}</p> : null}
      </Reveal>
      {props.chips?.length ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {props.chips.map((chip) => (
            <li key={chip.href}>
              <Button asChild variant="outline" size="sm">
                <Link href={chip.href}>{chip.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside>
          {/* Collapsible on small screens, always visible on desktop; both work without JavaScript. */}
          <details className="rounded-xl border p-4 lg:hidden">
            <summary className="flex cursor-pointer items-center gap-2 font-semibold">
              <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
              Szűrés és rendezés
            </summary>
            <div className="mt-4">
              <ListingFilters idPrefix="m" {...filterProps} />
            </div>
          </details>
          <div className="hidden lg:block">
            <ListingFilters idPrefix="d" {...filterProps} />
          </div>
        </aside>
        <section aria-labelledby="talalatok">
          <h2 id="talalatok" className="mb-4 text-sm font-semibold text-muted-foreground" aria-live="polite">
            {result.totalItems} termék{result.totalPages > 1 ? ` · ${result.page}. / ${result.totalPages} oldal` : ''}
          </h2>
          {result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <p className="font-semibold">Nincs a feltételeknek megfelelő termék.</p>
              <p className="mt-1 text-sm text-muted-foreground">Próbáljon kevesebb szűrőt vagy más keresőszót.</p>
              <Link href={props.basePath} className="mt-4 inline-block font-semibold text-primary underline">
                Szűrők törlése
              </Link>
            </div>
          ) : (
            <Reveal>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                {result.items.map((product: Product, index: number) => (
                  <li key={product.id}>
                    <ProductCard product={product} brandName={brandsById.get(product.brandId)?.name ?? ''} priority={index < 4} />
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
          <Pagination basePath={props.basePath} query={props.query} page={result.page} totalPages={result.totalPages} omit={omit} />
        </section>
      </div>
    </div>
  )
}
