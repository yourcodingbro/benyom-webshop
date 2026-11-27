import type { CollectionConfig } from 'payload'

import { requireStorage } from '@/collections/hooks/storageHooks'
import { adminOnly, publicRead } from '@/collections/utils/access'
import { NAV_GROUPS } from '@/collections/utils/nav-groups'

/** Formats a logo may use (shown with <img>-safe rendering on dark backgrounds). */
export const LOGO_MIME_TYPES: readonly string[] = ['image/png', 'image/webp', 'image/jpeg', 'image/avif', 'image/svg+xml']
/** Formats browsers accept as a favicon. */
export const FAVICON_MIME_TYPES: readonly string[] = ['image/png', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']

/**
 * Storefront branding images (logo, favicon), uploaded or picked in Áruház beállítások → Áruház. Stored in the same public
 * bucket under the fixed `branding/` prefix (see payload.config.ts): unlike product media, no brand/category/product
 * path is needed. Deleting a file in use only empties the setting (the storefront falls back to the store name).
 */
export const BrandingAssets: CollectionConfig = {
  slug: 'branding-assets',
  labels: { singular: 'Arculati kép', plural: 'Arculati képek' },
  // No sidebar entry: files are uploaded and chosen from Áruház beállítások → Áruház (Logó, Favicon); Payload's upload
  // and list drawers still open this collection there.
  admin: { useAsTitle: 'alt', group: NAV_GROUPS.SYSTEM, hidden: true, defaultColumns: ['filename', 'alt', 'mimeType'], description: 'Logó és favicon. Az Áruház beállítások Áruház fülén választható ki vagy tölthető fel közvetlenül.' },
  access: { read: publicRead, create: adminOnly, update: adminOnly, delete: adminOnly },
  upload: {
    mimeTypes: [...new Set([...LOGO_MIME_TYPES, ...FAVICON_MIME_TYPES])],
  },
  fields: [{ name: 'alt', label: 'Alternatív szöveg', type: 'text', required: true, admin: { description: 'Logónál ez a képernyőolvasók szövege (pl. az áruház neve).' } }],
  hooks: { beforeValidate: [requireStorage] },
}
