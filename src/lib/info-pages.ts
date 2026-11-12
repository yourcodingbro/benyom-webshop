/**
 * Informational pages that have their own top-level route instead of /info/[slug]. They are never
 * served under /info/ (old /oldal/ and /info/ URLs redirect here, see next.config.ts). No imports:
 * next.config.ts reads this file too.
 */
export const DEDICATED_INFO_PAGE_PATHS: Readonly<Record<string, string>> = {
  gyik: '/gyik',
  'fizetes-es-szallitas': '/fizetes-es-szallitas',
}

export function hasDedicatedRoute(slug: string): boolean {
  return Object.hasOwn(DEDICATED_INFO_PAGE_PATHS, slug)
}

/** Canonical path of an informational page by its settings slug. */
export function infoPagePath(slug: string): string {
  return DEDICATED_INFO_PAGE_PATHS[slug] ?? `/info/${slug}`
}
