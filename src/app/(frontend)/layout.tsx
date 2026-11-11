import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/600.css'
import '@fontsource/open-sans/700.css'
import './globals.css'

import type { Metadata, Viewport } from 'next'
import type React from 'react'

import { CartProvider } from '@/components/cart/CartProvider'
import { MotionProvider } from '@/components/layout/MotionProvider'
import { SampleModeBanner } from '@/components/layout/SampleModeBanner'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { getSiteUrl, isIndexingAllowed } from '@/config/runtime'
import { getStoreSettings } from '@/dto/settings'
import { catalogService } from '@/services/catalogService'

// The sample runtime store changes at runtime (orders, imports, price demos), so render on request.
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

export default async function FrontendLayout(props: FrontendLayoutProps): Promise<React.JSX.Element> {
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
            <SampleModeBanner />
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
