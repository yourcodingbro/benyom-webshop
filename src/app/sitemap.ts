import type { MetadataRoute } from 'next'

import { getSiteUrl } from '@/config/runtime'
import { getBrands } from '@/dto/brands'
import { getCategories } from '@/dto/categories'
import { getProductSitemapEntries } from '@/dto/products'
import { getStoreSettings } from '@/dto/settings'

/** Public catalog pages only; cart, checkout, orders and decision pages are excluded. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()
  const [brands, categories, products, settings] = await Promise.all([getBrands(), getCategories(), getProductSitemapEntries(), getStoreSettings()])
  const brandCategories = await Promise.all(
    brands.map(async (brand) => (await getCategories({ brandSlug: brand.slug })).map((category) => `${base}/marka/${brand.slug}/${category.slug}`)),
  )
  return [
    { url: base },
    { url: `${base}/termekek` },
    { url: `${base}/markak` },
    { url: `${base}/kategoriak` },
    ...brands.map((brand) => ({ url: `${base}/marka/${brand.slug}` })),
    ...brandCategories.flat().map((url: string) => ({ url })),
    ...categories.map((category) => ({ url: `${base}/kategoria/${category.slug}` })),
    ...products.map((product) => ({ url: `${base}/termek/${product.slug}`, lastModified: product.updatedAt })),
    ...settings.pages.map((page) => ({ url: `${base}/oldal/${page.slug}` })),
  ]
}
