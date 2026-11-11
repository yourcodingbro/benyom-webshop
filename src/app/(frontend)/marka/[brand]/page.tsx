import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'

import { CatalogListing } from '@/components/product/CatalogListing'
import { getBrandBySlug } from '@/dto/brands'
import { getCategories } from '@/dto/categories'
import { parseListingParams, type SearchParamsRecord } from '@/schemas/listing'

type BrandPageProps = {
  params: Promise<{ brand: string }>
  searchParams: Promise<SearchParamsRecord>
}

export async function generateMetadata(props: BrandPageProps): Promise<Metadata> {
  const brand = await getBrandBySlug((await props.params).brand)
  if (!brand) return {}
  return { title: `${brand.name} termékek`, description: brand.description, alternates: { canonical: `/marka/${brand.slug}` } }
}

export default async function BrandPage(props: BrandPageProps): Promise<React.JSX.Element> {
  const { brand: brandSlug } = await props.params
  const brand = await getBrandBySlug(brandSlug)
  if (!brand) notFound()
  const categories = await getCategories({ brandSlug: brand.slug })
  const query = { ...parseListingParams(await props.searchParams), brandSlug: brand.slug }
  return (
    <CatalogListing
      title={brand.name}
      description={brand.description}
      basePath={`/marka/${brand.slug}`}
      breadcrumbs={[{ label: brand.name }]}
      query={query}
      lockBrand
      chips={categories.map((category) => ({ label: `${brand.name} ${category.name.toLowerCase()}`, href: `/marka/${brand.slug}/${category.slug}` }))}
    />
  )
}
