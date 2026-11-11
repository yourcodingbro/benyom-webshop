import { normalizeHexColor } from '@/lib/hex'
import { isValidSlug } from '@/lib/slug'

type RouteContext = {
  params: Promise<{ path: string[] }>
}

type Silhouette = { width: number; height: number; radius: number; screenInset: number }

const SILHOUETTES: Record<string, Silhouette> = {
  mobiltelefon: { width: 200, height: 400, radius: 36, screenInset: 10 },
  tablet: { width: 300, height: 400, radius: 26, screenInset: 14 },
  okosora: { width: 190, height: 230, radius: 54, screenInset: 16 },
}

/**
 * Generated local placeholder images for sample data, served at the same
 * brand/category/product/[color]/filename keys that Supabase Storage will use.
 * Only validated slugs and HEX values reach the SVG; nothing else is echoed.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const segments = (await context.params).path
  if (segments.length < 4 || segments.length > 5) return new Response('Nem található', { status: 404 })
  const [brand = '', category = '', product = ''] = segments
  const colorSegment = segments.length === 5 ? segments[3] : null
  const file = segments.at(-1) ?? ''
  if (![brand, category, product].every(isValidSlug) || !/^[a-z0-9-]+\.svg$/.test(file)) return new Response('Nem található', { status: 404 })
  const hex = colorSegment ? normalizeHexColor(`#${colorSegment}`) : '#9A9A9A'
  if (!hex) return new Response('Nem található', { status: 404 })

  const shape = SILHOUETTES[category] ?? { width: 260, height: 320, radius: 24, screenInset: 14 }
  const x = (500 - shape.width) / 2
  const y = (500 - shape.height) / 2
  const inset = shape.screenInset
  const strap = category === 'okosora' ? `<rect x="${x + 40}" y="40" width="${shape.width - 80}" height="420" rx="30" fill="${hex}" opacity="0.55"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" role="img" aria-label="Mintakép">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#000000" stop-opacity="0.15"/></linearGradient></defs>
<rect width="500" height="500" fill="#f4f4f4"/>
${strap}
<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" rx="${shape.radius}" fill="${hex}" stroke="#00000033" stroke-width="2"/>
<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" rx="${shape.radius}" fill="url(#g)"/>
<rect x="${x + inset}" y="${y + inset}" width="${shape.width - inset * 2}" height="${shape.height - inset * 2}" rx="${Math.max(shape.radius - inset, 6)}" fill="#151515" opacity="0.9"/>
<text x="250" y="478" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#777">MINTAKÉP · ${hex}</text>
</svg>`
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
    },
  })
}
