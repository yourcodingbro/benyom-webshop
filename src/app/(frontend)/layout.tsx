import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/600.css'
import '@fontsource/open-sans/700.css'
import './globals.css'

import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { permanentRedirect } from 'next/navigation'
import type React from 'react'

import { CartProvider } from '@/components/cart/CartProvider'
import { MotionProvider } from '@/components/layout/MotionProvider'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { getSiteUrl, isIndexingAllowed } from '@/config/runtime'
import { getCanonicalSlugForFormer } from '@/dto/products'
import { getStoreSettings } from '@/dto/settings'
import { PRODUCT_REQUEST_HEADER } from '@/proxy'
import { catalogService } from '@/services/catalogService'

// Catalog, settings and orders live in the database and change at runtime, so render on request.
export const dynamic = 'force-dynamic'

type FrontendLayoutProps = {
  children: React.ReactNode
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: settings.seo.defaultTitle, template: `%s | ${settings.storeName}` },
    description: settings.seo.defaultDescription,
    // Sample deployments are never indexed.
    robots: isIndexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { locale: 'hu_HU', type: 'website', siteName: settings.storeName },
  }
}

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
}

/**
 * 308 from a renamed product's former URL to its current one, before streaming starts. The proxy sets
 * the header for /termek/<slug> (replacing any client-sent copy there); a forged header on another path
 * could only redirect its own sender to a real product page. Client-side navigations are redirected by
 * the product page itself.
 */
async function redirectFormerProductSlug(): Promise<void> {
  const raw = (await headers()).get(PRODUCT_REQUEST_HEADER)
  if (!raw) return
  let request: { slug?: unknown; search?: unknown }
  try {
    request = JSON.parse(raw) as { slug?: unknown; search?: unknown }
  } catch {
    return
  }
  if (typeof request.slug !== 'string') return
  const canonical = await getCanonicalSlugForFormer(request.slug)
  if (canonical) permanentRedirect(`/termek/${canonical}${typeof request.search === 'string' ? request.search : ''}`)
}

export default async function FrontendLayout(props: FrontendLayoutProps): Promise<React.JSX.Element> {
  await redirectFormerProductSlug()
  const [settings, navigation] = await Promise.all([getStoreSettings(), catalogService.getNavigation()])
  return (
    <html lang="hu">
      <head>
        <noscript>
          {/* Reveal animations start hidden; keep content visible when JavaScript is unavailable. */}
          <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
      </head>
      <body className="flex min-h-screen flex-col">
        <MotionProvider>
          <CartProvider>
            <SiteHeader storeName={settings.storeName} navigation={navigation} />
            <main id="tartalom" className="flex-1">
              {props.children}
            </main>
            <SiteFooter settings={settings} />
          </CartProvider>
        </MotionProvider>
      </body>
    </html>
  )
}
