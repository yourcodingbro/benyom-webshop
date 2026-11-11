import 'server-only'

import { getBrands } from '@/dto/brands'
import { getCategories } from '@/dto/categories'
import type { Brand, Category } from '@/types/catalog'

export type BrandNavigationItem = {
  brand: Brand
  categories: Category[]
}

type CatalogService = {
  /** Brand-first navigation generated from data: each brand lists only categories it has products in. */
  getNavigation: () => Promise<BrandNavigationItem[]>
}

export const catalogService: CatalogService = {
  async getNavigation(): Promise<BrandNavigationItem[]> {
    const brands = await getBrands()
    const items = await Promise.all(
      brands.map(async (brand: Brand): Promise<BrandNavigationItem> => ({ brand, categories: await getCategories({ brandSlug: brand.slug }) })),
    )
    return items.filter((item: BrandNavigationItem) => item.categories.length > 0)
  },
}
