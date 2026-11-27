import type { Metadata } from 'next'

import type { SeoOverride } from '@/types/catalog'

type EntityMetadataInput = {
  /** The entity's editable SEO fields (product, brand or category). */
  seo: SeoOverride | undefined
  /** Used when the SEO title is empty. */
  fallbackTitle: string
  /** Used when the SEO description is empty. */
  fallbackDescription: string
  /** Canonical path, e.g. /termek/iphone-17 (resolved against metadataBase, the configured site URL). */
  canonical: string
  image?: { url: string; alt: string } | null
}

/**
 * Metadata of a product, brand or category page: the editable SEO title/description, or the entity's own name and
 * description when they are empty, used the same way in standard, Open Graph and Twitter metadata.
 */
export function entityMetadata(input: EntityMetadataInput): Metadata {
  const title = input.seo?.title || input.fallbackTitle
  const description = input.seo?.description || input.fallbackDescription || undefined
  const images = input.image ? [{ url: input.image.url, alt: input.image.alt }] : []
  return {
    title,
    description,
    alternates: { canonical: input.canonical },
    openGraph: { type: 'website', locale: 'hu_HU', title, description, url: input.canonical, images },
    twitter: { card: images.length > 0 ? 'summary_large_image' : 'summary', title, description, images: images.map((image) => image.url) },
  }
}
