import 'server-only'

import { relationId } from '@/dto/payload'
import type { Brand as BrandDoc, Category as CategoryDoc, Media as MediaDoc, Product as ProductDoc } from '@/payload-types'
import type { Brand, Category, ProcurementEstimate, Product, ProductImage, ProductInput, ProductVariant } from '@/types/catalog'

/* Payload document ⇄ application type mapping for the catalog. Private to src/dto/. */

export function toBrand(doc: BrandDoc): Brand {
  return { id: doc.id, slug: doc.slug, name: doc.name, description: doc.description ?? '', sortOrder: doc.sortOrder ?? 100, popularityRank: doc.popularityRank }
}

export function toCategory(doc: CategoryDoc): Category {
  return { id: doc.id, slug: doc.slug, name: doc.name, description: doc.description ?? '', sortOrder: doc.sortOrder ?? 100, popularityRank: doc.popularityRank }
}

function toImage(value: number | MediaDoc): ProductImage | null {
  if (typeof value === 'number') return null
  return { id: String(value.id), objectKey: value.objectKey ?? '', url: value.url ?? '', alt: value.alt, colorHex: value.colorHex ?? null }
}

function toEstimate(value: { minDays?: number | null; maxDays?: number | null } | undefined): ProcurementEstimate | null {
  return typeof value?.minDays === 'number' && typeof value.maxDays === 'number' ? { minDays: value.minDays, maxDays: value.maxDays } : null
}

/** Expects depth ≥ 1 (media populated); unpopulated media are skipped rather than invented. */
export function toProduct(doc: ProductDoc): Product {
  const images = new Map<string, ProductImage>()
  const collect = (values: (number | MediaDoc)[] | null | undefined): string[] =>
    (values ?? []).flatMap((value: number | MediaDoc) => {
      const image = toImage(value)
      if (!image) return []
      images.set(image.id, image)
      return [image.id]
    })
  collect(doc.images)
  const variants: ProductVariant[] = doc.variants.map((variant) => ({
    sku: variant.sku,
    attributes: {
      colorHex: variant.colorHex ?? null,
      colorLabel: variant.colorLabel ?? null,
      storageGb: variant.storageGb ?? null,
      ramGb: variant.ramGb ?? null,
      caseSizeMm: variant.caseSizeMm ?? null,
    },
    price: variant.price,
    orderability: variant.orderability,
    procurementEstimate: toEstimate(variant.procurementEstimate),
    imageIds: collect(variant.images),
  }))
  return {
    id: doc.id,
    slug: doc.slug,
    name: doc.name,
    model: doc.model,
    brandId: relationId(doc.brand) ?? '',
    categoryIds: doc.categories.map((category) => relationId(category) ?? '').filter(Boolean),
    description: doc.description ?? '',
    specifications: (doc.specifications ?? []).map((group) => ({ title: group.title, items: (group.items ?? []).map((item) => ({ label: item.label, value: item.value })) })),
    images: [...images.values()],
    variants,
    status: doc._status === 'published' ? 'published' : 'draft',
    featured: Boolean(doc.featured),
    orderability: doc.orderability,
    procurementEstimate: toEstimate(doc.procurementEstimate),
    seo: { title: doc.seo?.title ?? null, description: doc.seo?.description ?? null },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

type ProductData = Omit<ProductDoc, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }

/** Product images are product-level media; variant images are a subset referenced by id. */
export function toProductData(input: Partial<ProductInput>): Partial<ProductData> {
  const data: Partial<ProductData> = {}
  if (input.id !== undefined) data.id = input.id
  if (input.slug !== undefined) data.slug = input.slug
  if (input.name !== undefined) data.name = input.name
  if (input.model !== undefined) data.model = input.model
  if (input.brandId !== undefined) data.brand = input.brandId
  if (input.categoryIds !== undefined) data.categories = input.categoryIds
  if (input.description !== undefined) data.description = input.description
  if (input.featured !== undefined) data.featured = input.featured
  if (input.orderability !== undefined) data.orderability = input.orderability
  if (input.procurementEstimate !== undefined) data.procurementEstimate = { minDays: input.procurementEstimate?.minDays ?? null, maxDays: input.procurementEstimate?.maxDays ?? null }
  if (input.images !== undefined) data.images = input.images.map((image: ProductImage) => Number(image.id)).filter(Number.isSafeInteger)
  if (input.specifications !== undefined) data.specifications = input.specifications.map((group) => ({ title: group.title, items: group.items.map((item) => ({ label: item.label, value: item.value })) }))
  if (input.seo !== undefined) data.seo = { title: input.seo.title, description: input.seo.description }
  if (input.status !== undefined) data._status = input.status
  if (input.variants !== undefined) {
    data.variants = input.variants.map((variant: ProductVariant) => ({
      sku: variant.sku,
      colorHex: variant.attributes.colorHex,
      colorLabel: variant.attributes.colorLabel,
      storageGb: variant.attributes.storageGb,
      ramGb: variant.attributes.ramGb,
      caseSizeMm: variant.attributes.caseSizeMm,
      price: variant.price,
      orderability: variant.orderability,
      procurementEstimate: { minDays: variant.procurementEstimate?.minDays ?? null, maxDays: variant.procurementEstimate?.maxDays ?? null },
      images: variant.imageIds.map(Number).filter(Number.isSafeInteger),
    }))
  }
  return data
}
