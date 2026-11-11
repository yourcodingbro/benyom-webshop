import { hexToPathSegment } from '@/lib/hex'
import { isValidSlug, slugify } from '@/lib/slug'

type MediaObjectKeyInput = {
  brandSlug: string
  categorySlug: string
  productSlug: string
  colorHex: string | null
  fileName: string
  /** Collision-resistant suffix (e.g. short random id); omit only for fixed sample assets. */
  uniqueSuffix: string | null
}

const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set(['webp', 'jpg', 'jpeg', 'png', 'avif', 'svg'])

/**
 * Builds a Supabase Storage object key: brand/category/product/[color]/filename.
 * The key is stored explicitly on the media record; relations are never inferred from it.
 */
export function buildMediaObjectKey(input: MediaObjectKeyInput): string {
  for (const segment of [input.brandSlug, input.categorySlug, input.productSlug]) {
    if (!isValidSlug(segment)) throw new RangeError(`Érvénytelen útvonal-szegmens: ${segment}`)
  }
  const dot = input.fileName.lastIndexOf('.')
  const extension = dot > 0 ? input.fileName.slice(dot + 1).toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new RangeError('Nem engedélyezett fájltípus')
  const base = slugify(input.fileName.slice(0, dot)) || 'kep'
  const suffix = input.uniqueSuffix ? `-${slugify(input.uniqueSuffix)}` : ''
  const segments = [input.brandSlug, input.categorySlug, input.productSlug]
  if (input.colorHex) segments.push(hexToPathSegment(input.colorHex))
  segments.push(`${base}${suffix}.${extension}`)
  return segments.join('/')
}
