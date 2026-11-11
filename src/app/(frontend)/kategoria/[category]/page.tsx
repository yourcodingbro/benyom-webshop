import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'

import { CatalogListing } from '@/components/product/CatalogListing'
import { getCategoryBySlug } from '@/dto/categories'
import { parseListingParams, type SearchParamsRecord } from '@/schemas/listing'

type CategoryPageProps = {
  params: Promise<{ category: string }>
  searchParams: Promise<SearchParamsRecord>
}

export async function generateMetadata(props: CategoryPageProps): Promise<Metadata> {
  const category = await getCategoryBySlug((await props.params).category)
  if (!category) return {}
  return { title: category.name, description: category.description, alternates: { canonical: `/kategoria/${category.slug}` } }
}

export default async function CategoryPage(props: CategoryPageProps): Promise<React.JSX.Element> {
  const category = await getCategoryBySlug((await props.params).category)
  if (!category) notFound()
  const query = { ...parseListingParams(await props.searchParams), categorySlug: category.slug }
  return (
    <CatalogListing
      title={category.name}
      description={category.description}
      basePath={`/kategoria/${category.slug}`}
      breadcrumbs={[{ label: category.name }]}
      query={query}
      lockCategory
    />
  )
}
