import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'

import { CatalogListing } from '@/components/product/CatalogListing'
import { getBrandBySlug } from '@/dto/brands'
import { getCategoryBySlug } from '@/dto/categories'
import { parseListingParams, type SearchParamsRecord } from '@/schemas/listing'

type BrandCategoryPageProps = {
  params: Promise<{ brand: string; category: string }>
  searchParams: Promise<SearchParamsRecord>
}

export async function generateMetadata(props: BrandCategoryPageProps): Promise<Metadata> {
  const params = await props.params
  const [brand, category] = await Promise.all([getBrandBySlug(params.brand), getCategoryBySlug(params.category)])
  if (!brand || !category) return {}
  return {
    title: `${brand.name} ${category.name.toLowerCase()}`,
    description: `${brand.name} ${category.name.toLowerCase()} előrendelésre, fizetés átvételkor.`,
    alternates: { canonical: `/marka/${brand.slug}/${category.slug}` },
  }
}

export default async function BrandCategoryPage(props: BrandCategoryPageProps): Promise<React.JSX.Element> {
  const params = await props.params
  const [brand, category] = await Promise.all([getBrandBySlug(params.brand), getCategoryBySlug(params.category)])
  if (!brand || !category) notFound()
  const query = { ...parseListingParams(await props.searchParams), brandSlug: brand.slug, categorySlug: category.slug }
  return (
    <CatalogListing
      title={`${brand.name} ${category.name.toLowerCase()}`}
      description={category.description}
      basePath={`/marka/${brand.slug}/${category.slug}`}
      breadcrumbs={[{ label: brand.name, href: `/marka/${brand.slug}` }, { label: category.name }]}
      query={query}
      lockBrand
      lockCategory
    />
  )
}
