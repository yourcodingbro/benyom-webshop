import { NextResponse, type NextRequest } from 'next/server'

import { APP_ENVS } from '@/config/env'

/**
 * Development tools are served only when APP_ENV is valid and not `production`. Every spelling of the
 * route is covered (`/fejlesztes`, `/fejlesztés`, percent-encoded and any case), including server
 * action POSTs to them. A missing or invalid APP_ENV fails closed. The page and its actions check
 * again on their own (defense in depth).
 */
const DEV_PATH: RegExp = /^\/fejleszt(e|é)s(\/|$)/i
const PRODUCT_PATH: RegExp = /^\/termek\/([^/]+)\/?$/

/** Product page requests carry their slug and query to the frontend layout (former-slug 308 redirects). */
export const PRODUCT_REQUEST_HEADER: string = 'x-benyom-product-request'

function devToolsAllowed(): boolean {
  const appEnv = process.env.APP_ENV
  return appEnv !== undefined && (APP_ENVS as readonly string[]).includes(appEnv) && appEnv !== 'production'
}

export function proxy(request: NextRequest): NextResponse {
  let path = request.nextUrl.pathname
  try {
    path = decodeURIComponent(path).normalize('NFC')
  } catch {
    return new NextResponse('Nem található', { status: 404 })
  }
  if (DEV_PATH.test(path) && !devToolsAllowed()) {
    return new NextResponse('Nem található', { status: 404, headers: { 'x-robots-tag': 'noindex' } })
  }
  // The storefront streams (loading.tsx), so a redirect from the product page itself could only be a
  // <meta refresh>. The layout resolves former slugs before streaming starts and answers with a real 308.
  const headers = new Headers(request.headers)
  headers.delete(PRODUCT_REQUEST_HEADER)
  const product = PRODUCT_PATH.exec(path)
  if (product?.[1]) headers.set(PRODUCT_REQUEST_HEADER, JSON.stringify({ slug: product[1], search: request.nextUrl.search }))
  return NextResponse.next({ request: { headers } })
}

export const config: { matcher: string[] } = {
  // The app has one dev route (/fejlesztes); other spellings are matched too, so no alias is ever served.
  matcher: ['/fejlesztes', '/fejlesztes/:path*', '/fejleszt%C3%A9s', '/fejleszt%C3%A9s/:path*', '/fejlesztés', '/fejlesztés/:path*', '/termek/:slug'],
}
