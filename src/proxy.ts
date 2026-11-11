import { NextResponse, type NextRequest } from 'next/server'

/**
 * Payload's admin (/admin) and APIs (/api/*) need a database. In sample mode there is none,
 * so these routes answer an explicit 503 instead of initializing Payload. Nothing here
 * imitates the Payload admin UI.
 */
const UNAVAILABLE_HTML: string = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Admin nem elérhető</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:10vh auto;padding:0 16px;color:#333">
<h1 style="font-size:1.4rem">A Payload admin felület minta módban nem elérhető</h1>
<p>Az adminisztrációhoz adatbázis szükséges (DATABASE_URL és PAYLOAD_SECRET). Minta módban nincs adatbázis-kapcsolat, ezért a natív Payload admin és API szándékosan ki van kapcsolva.</p>
<p>A mintafolyamatok (rendelések, árváltozási ajánlatok, e-mail előnézetek, CSV-import) fejlesztői módban a <a href="/fejlesztes">/fejlesztes</a> oldalon próbálhatók ki.</p>
<p>Részletek: docs/sample-mode.md és docs/deployment.md.</p></body></html>`

export function proxy(request: NextRequest): NextResponse {
  if (process.env.DATABASE_URL && process.env.PAYLOAD_SECRET) return NextResponse.next()
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'A Payload API minta módban nem elérhető (nincs adatbázis).' }, { status: 503 })
  }
  return new NextResponse(UNAVAILABLE_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } })
}

export const config: { matcher: string[] } = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
}
