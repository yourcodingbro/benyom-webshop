import { NextResponse, type NextRequest } from 'next/server'

import { APP_ENVS } from '@/config/env'

/**
 * Development tools are served only when APP_ENV is valid and not `production`. Every spelling of the
 * route is covered (`/fejlesztes`, `/fejlesztés`, percent-encoded and any case), including server
 * action POSTs to them. A missing or invalid APP_ENV fails closed. The page and its actions check
 * again on their own (defense in depth).
 */
const DEV_PATH: RegExp = /^\/fejleszt(e|é)s(\/|$)/i

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
  return NextResponse.next()
}

export const config: { matcher: string[] } = {
  // The app has one dev route (/fejlesztes); other spellings are matched too, so no alias is ever served.
  matcher: ['/fejlesztes', '/fejlesztes/:path*', '/fejleszt%C3%A9s', '/fejleszt%C3%A9s/:path*', '/fejlesztés', '/fejlesztés/:path*'],
}
