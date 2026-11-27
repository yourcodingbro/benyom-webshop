import type { Metadata } from 'next'
import type React from 'react'

import { CatalogListing } from '@/components/product/CatalogListing'
import { PAGE_DESCRIPTIONS } from '@/config/seo'
import { parseListingParams, type SearchParamsRecord } from '@/schemas/listing'

type ProductsPageProps = {
  searchParams: Promise<SearchParamsRecord>
}

export async function generateMetadata(props: ProductsPageProps): Promise<Metadata> {
  const query = parseListingParams(await props.searchParams)
  return {
    title: query.search ? `Keresés: ${query.search}` : 'Összes termék',
    description: PAGE_DESCRIPTIONS.products,
    alternates: { canonical: '/termekek' },
  }
}

export default async function ProductsPage(props: ProductsPageProps): Promise<React.JSX.Element> {
  const query = parseListingParams(await props.searchParams)
  return (
    <CatalogListing
      title={query.search ? `Keresés: „${query.search}”` : 'Összes termék'}
      description="Szűrjön márka, kategória, szín, tárhely és ár szerint. Minden termék előrendelhető, fizetés átvételkor."
      basePath="/termekek"
      breadcrumbs={[{ label: 'Termékek' }]}
      query={query}
    />
  )
}
