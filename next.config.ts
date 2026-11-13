import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { getServerEnv, getStorageEnv } from './src/config/env'
import { DEDICATED_INFO_PAGE_PATHS } from './src/lib/info-pages'

const dirname: string = path.dirname(fileURLToPath(import.meta.url))

const securityHeaders: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
]

/**
 * next/image may load product media only from the configured Supabase project, and only from its public
 * bucket path (the URLs Payload stores for media). Derived from the validated server env (src/config/env.ts),
 * so a missing or malformed value fails with a clear message; nothing is allowed when storage is not
 * configured (uploads are refused then, so no remote media exists).
 */
function supabaseImagePatterns(): NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> {
  const storage = getStorageEnv(getServerEnv())
  if (!storage) return []
  const url = new URL(storage.publicBaseUrl)
  if (url.protocol !== 'https:') throw new Error(`SUPABASE_URL HTTPS-címet igényel (képek: next/image remotePatterns), kapott protokoll: ${url.protocol}`)
  return [{ protocol: 'https', hostname: url.hostname, pathname: `${url.pathname}/**` }]
}

const nextConfig: NextConfig = {
  // Decision links carry a secret token in the path; keep it out of the dev request log.
  logging: { incomingRequests: { ignore: [/\/arvaltozas\//] } },
  images: {
    localPatterns: [{ pathname: '/api/media/file/**' }],
    remotePatterns: supabaseImagePatterns(),
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
