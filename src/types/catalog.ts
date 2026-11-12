import type { HufAmount, IsoDateTime, Paginated } from '@/types/common'

export type Orderability = 'preorderable' | 'temporarily_unavailable' | 'discontinued'
export type PublicationStatus = 'draft' | 'published'

export type Brand = {
  id: string
  slug: string
  name: string
  description: string
  sortOrder: number
  /** Explicit editorial popularity ranking (1 = most popular). Not derived from sales. */
  popularityRank: number
}

export type Category = {
  id: string
  slug: string
  name: string
  description: string
  sortOrder: number
  /** Explicit editorial popularity ranking (1 = most popular). Not derived from sales. */
  popularityRank: number
}

export type ProductImage = {
  id: string
  /** Explicit storage object key: brand/category/product/[color]/filename. Never parsed back into relations. */
  objectKey: string
  url: string
  alt: string
  /** Normalized #RRGGBB of the color this image shows, or null when shared by all colors. */
  colorHex: string | null
}

export type VariantAttributes = {
  /** Normalized #RRGGBB. */
  colorHex: string | null
  /** Optional descriptive label; the HEX value is used when absent. */
  colorLabel: string | null
  storageGb: number | null
  ramGb: number | null
  caseSizeMm: number | null
}

export type ProcurementEstimate = {
  minDays: number
  maxDays: number
}

export type ProductVariant = {
  sku: string
  attributes: VariantAttributes
  price: HufAmount
  orderability: Orderability
  procurementEstimate: ProcurementEstimate | null
  imageIds: string[]
}

export type SpecificationGroup = {
  title: string
  items: { label: string; value: string }[]
}

export type Product = {
  id: string
  slug: string
  name: string
  model: string
  brandId: string
  categoryIds: string[]
  description: string
  specifications: SpecificationGroup[]
  images: ProductImage[]
  variants: ProductVariant[]
  status: PublicationStatus
  featured: boolean
  /** Product-wide orderability; overrides variants when not preorderable. */
  orderability: Orderability
  procurementEstimate: ProcurementEstimate | null
  seo: { title: string | null; description: string | null }
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
export type ProductUpdate = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>

export type ProductSort = 'featured' | 'price_asc' | 'price_desc' | 'name_asc' | 'newest'

export type ProductQuery = {
  search?: string
  brandSlug?: string
  categorySlug?: string
  colors?: string[]
  storageGb?: number[]
  minPrice?: number
  maxPrice?: number
  sort?: ProductSort
  page?: number
  /** Defaults to the desktop listing size. */
  pageSize?: number
  featuredOnly?: boolean
}

export type ProductFacets = {
  colors: { hex: string; label: string | null }[]
  storageGb: number[]
  priceRange: { min: HufAmount; max: HufAmount } | null
}

export type ProductListResult = Paginated<Product> & { facets: ProductFacets }

export type VariantLookup = {
  product: Product
  variant: ProductVariant
  brand: Brand
}
