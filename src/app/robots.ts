import type { MetadataRoute } from 'next'

import { getSiteUrl, isIndexingAllowed } from '@/config/runtime'

export const dynamic = 'force-dynamic'

/** Sample deployments disallow everything; a live store still never indexes private flows. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexingAllowed()) return { rules: [{ userAgent: '*', disallow: '/' }] }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/kosar', '/penztar', '/rendeles', '/arvaltozas', '/fejlesztes', '/admin', '/api'] }],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  }
}
