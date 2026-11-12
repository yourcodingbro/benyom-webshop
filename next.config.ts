import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { DEDICATED_INFO_PAGE_PATHS } from './src/lib/info-pages'

const dirname: string = path.dirname(fileURLToPath(import.meta.url))

const securityHeaders: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
]

const nextConfig: NextConfig = {
  // Decision links carry a secret token in the path; keep it out of the dev request log.
  logging: { incomingRequests: { ignore: [/\/arvaltozas\//] } },
  images: {
    localPatterns: [{ pathname: '/api/media/file/**' }, { pathname: '/sample-media/**' }],
  },
  async redirects() {
    // Next applies the first matching rule, so the specific ones come before the general /oldal/:slug
    // rule. Every rule points straight at the final canonical URL (no chains), and no destination is
    // itself a source (no loops).
    const dedicated = Object.entries(DEDICATED_INFO_PAGE_PATHS).flatMap(([slug, destination]) =>
      [`/oldal/${slug}`, `/info/${slug}`].map((source: string) => ({ source, destination, permanent: true })),
    )
    return [
      ...dedicated,
      { source: '/oldal/szallitas', destination: '/fizetes-es-szallitas', permanent: true },
      { source: '/oldal/kapcsolat', destination: '/kapcsolat', permanent: true },
      { source: '/oldal/:slug', destination: '/info/:slug', permanent: true },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Decision links carry a secret token in the path: never leak it via Referer.
      { source: '/arvaltozas/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
