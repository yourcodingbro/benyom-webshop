import { normalizeHexColor } from '@/lib/hex'

type Silhouette = { width: number; height: number; radius: number; screenInset: number }

const SILHOUETTES: Record<string, Silhouette> = {
  mobiltelefon: { width: 200, height: 400, radius: 36, screenInset: 10 },
  tablet: { width: 300, height: 400, radius: 26, screenInset: 14 },
  okosora: { width: 190, height: 230, radius: 54, screenInset: 16 },
}

/**
 * Generated product placeholder (migration input only): a device silhouette in the variant's HEX color.
 * The initial import rasterizes it to WebP with sharp and uploads it to Supabase Storage. Only a
 * validated HEX and a known category shape reach the SVG.
 */
export function placeholderSvg(categorySlug: string, colorHex: string | null): string {
  const hex = (colorHex ? normalizeHexColor(colorHex) : null) ?? '#9A9A9A'
  const shape = SILHOUETTES[categorySlug] ?? { width: 260, height: 320, radius: 24, screenInset: 14 }
  const x = (500 - shape.width) / 2
  const y = (500 - shape.height) / 2
  const inset = shape.screenInset
  const strap = categorySlug === 'okosora' ? `<rect x="${x + 40}" y="40" width="${shape.width - 80}" height="420" rx="30" fill="${hex}" opacity="0.55"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="800" height="800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#000000" stop-opacity="0.15"/></linearGradient></defs>
<rect width="500" height="500" fill="#f4f4f4"/>
${strap}
<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" rx="${shape.radius}" fill="${hex}" stroke="#00000033" stroke-width="2"/>
<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" rx="${shape.radius}" fill="url(#g)"/>
<rect x="${x + inset}" y="${y + inset}" width="${shape.width - inset * 2}" height="${shape.height - inset * 2}" rx="${Math.max(shape.radius - inset, 6)}" fill="#151515" opacity="0.9"/>
<text x="250" y="478" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#777">MINTAKÉP · ${hex}</text>
</svg>`
}
