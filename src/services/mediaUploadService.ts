import 'server-only'

import { randomUUID } from 'node:crypto'

import { type CreatedMedia, confirmReservedSlug, createProductMedia, getStoredProductSlug, getTaxonomySlug, reserveSlugForName, type UploadedFile } from '@/dto/media'
import { assertAdminOrSystem } from '@/lib/authorization'
import { clock } from '@/lib/clock'
import { AppError } from '@/lib/errors'
import { normalizeHexColor } from '@/lib/hex'
import { slugify } from '@/lib/slug'
import { buildMediaObjectKey } from '@/lib/storage-path'
import type { AuthorizationContext } from '@/types/auth'

/** What the product form knows when a new image is uploaded; every value is re-checked on the server. */
export type ProductImageUploadInput = {
  /** Saved product id; its stored slug is used and any client slug is ignored. */
  productId: string | null
  name: string
  /** Slug reserved by an earlier upload of the same unsaved form. */
  slug: string | null
  brandId: string
  /** Primary category (defaults to the first selected category in the form). */
  categoryId: string
  /** Set for a variant image: the variant's color. */
  variantColorHex: string | null
  isVariantImage: boolean
  colorLabel: string | null
}

export type ProductImageUploadResult = CreatedMedia & { productSlug: string }

type MediaUploadService = {
  uploadProductImage: (input: ProductImageUploadInput, file: UploadedFile | null, auth: AuthorizationContext) => Promise<ProductImageUploadResult>
}

/** The extension follows the actual content type (no conversion happens). */
const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/avif': 'avif' }
const MAX_BYTES: number = 10 * 1024 * 1024

function prerequisiteErrors(input: ProductImageUploadInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.name.trim()) errors.name = 'Adja meg a termék nevét.'
  if (!input.brandId) errors.brand = 'Válasszon márkát.'
  if (!input.categoryId) errors.categories = 'Válasszon legalább egy kategóriát.'
  if (input.isVariantImage && !normalizeHexColor(input.variantColorHex)) errors.colorHex = 'Adjon meg érvényes HEX színt a változathoz (pl. #1F1F1F).'
  return errors
}

async function productSlugFor(input: ProductImageUploadInput, auth: AuthorizationContext): Promise<string> {
  const now = clock.now()
  if (input.productId) {
    const stored = await getStoredProductSlug(input.productId, auth)
    if (stored) return stored
    throw new AppError('NOT_FOUND', 'A termék nem található; frissítse az oldalt.')
  }
  // An unsaved form may carry a slug typed by the admin: normalized here, then it must be free or reserved.
  const entered = input.slug ? slugify(input.slug) : ''
  if (entered) {
    if (await confirmReservedSlug(entered, now, auth)) return entered
    throw new AppError('CONFLICT', 'A termék lefoglalt URL-azonosítója már nem érvényes. Mentse a terméket, majd töltse fel újra a képet.')
  }
  return reserveSlugForName(input.name, now, auth)
}

export const mediaUploadService: MediaUploadService = {
  /**
   * Uploads a new product or variant image to brand/category/product/[color]/filename. The path is
   * derived only from stored records (brand and category by id, the product's stored or reserved
   * slug) and the sanitized file name with a random suffix; the browser never sends a path.
   */
  async uploadProductImage(input: ProductImageUploadInput, file: UploadedFile | null, auth: AuthorizationContext): Promise<ProductImageUploadResult> {
    assertAdminOrSystem(auth)
    const errors = prerequisiteErrors(input)
    if (Object.keys(errors).length > 0) {
      throw new AppError('VALIDATION', 'A képfeltöltéshez hiányzó adatok: ' + Object.values(errors).join(' '), errors)
    }
    if (!file) throw new AppError('VALIDATION', 'Nincs kiválasztott fájl.')
    const extension = EXTENSIONS[file.mimetype]
    if (!extension) throw new AppError('VALIDATION', 'Csak WebP, JPEG, PNG vagy AVIF kép tölthető fel.')
    if (file.size > MAX_BYTES) throw new AppError('VALIDATION', 'A kép legfeljebb 10 MB lehet.')

    const [brandSlug, categorySlug] = await Promise.all([getTaxonomySlug('brands', input.brandId), getTaxonomySlug('categories', input.categoryId)])
    if (!brandSlug) throw new AppError('VALIDATION', 'A kiválasztott márka nem található.', { brand: 'A kiválasztott márka nem található.' })
    if (!categorySlug) throw new AppError('VALIDATION', 'A kiválasztott kategória nem található.', { categories: 'A kiválasztott kategória nem található.' })
    const productSlug = await productSlugFor(input, auth)
    const colorHex = input.isVariantImage ? normalizeHexColor(input.variantColorHex) : null

    const dot = file.name.lastIndexOf('.')
    const objectKey = buildMediaObjectKey({
      brandSlug,
      categorySlug,
      productSlug,
      colorHex,
      fileName: `${dot > 0 ? file.name.slice(0, dot) : file.name}.${extension}`,
      uniqueSuffix: randomUUID().slice(0, 8),
    })
    const slash = objectKey.lastIndexOf('/')
    const label = colorHex ? ` – ${input.colorLabel?.trim() || colorHex}` : ''
    const created = await createProductMedia(
      { alt: `${input.name.trim()}${label}`.slice(0, 200), brandSlug, categorySlug, productSlug, colorHex, prefix: objectKey.slice(0, slash) },
      { ...file, name: objectKey.slice(slash + 1) },
      auth,
    )
    return { ...created, productSlug }
  },
}
