import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProductConfigurator } from '@/components/product/ProductConfigurator'
import { Reveal } from '@/components/Reveal'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { getSiteUrl } from '@/config/runtime'
import { getBrands } from '@/dto/brands'
import { getCategories } from '@/dto/categories'
import { getProductBySlug } from '@/dto/products'
import { effectiveOrderability, primaryImage } from '@/lib/catalog'
import type { Orderability, Product } from '@/types/catalog'

type ProductPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const SCHEMA_AVAILABILITY: Record<Orderability, string> = {
  preorderable: 'https://schema.org/PreOrder',
  temporarily_unavailable: 'https://schema.org/OutOfStock',
  discontinued: 'https://schema.org/Discontinued',
}

function structuredData(product: Product, brandName: string): Record<string, unknown> {
  const url = `${getSiteUrl()}/termek/${product.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    model: product.model,
    description: product.description,
    brand: { '@type': 'Brand', name: brandName },
    image: product.images.map((image) => `${getSiteUrl()}${image.url}`),
    offers: product.variants.map((variant) => ({
      '@type': 'Offer',
      sku: variant.sku,
      price: variant.price,
      priceCurrency: 'HUF',
      availability: SCHEMA_AVAILABILITY[effectiveOrderability(product, variant)],
      url: `${url}?valtozat=${encodeURIComponent(variant.sku)}`,
    })),
  }
}

export async function generateMetadata(props: ProductPageProps): Promise<Metadata> {
  const product = await getProductBySlug((await props.params).slug)
  if (!product) return {}
  const image = primaryImage(product)
  return {
    title: product.seo.title ?? product.name,
    description: product.seo.description ?? product.description,
    alternates: { canonical: `/termek/${product.slug}` },
    openGraph: { title: product.name, description: product.description, images: image ? [{ url: image.url, alt: image.alt }] : [] },
  }
}

export default async function ProductPage(props: ProductPageProps): Promise<React.JSX.Element> {
  const [{ slug }, searchParams] = await Promise.all([props.params, props.searchParams])
  const product = await getProductBySlug(slug)
  if (!product) notFound()
  const [brands, categories] = await Promise.all([getBrands(), getCategories()])
  const brand = brands.find((item) => item.id === product.brandId)
  const category = categories.find((item) => product.categoryIds.includes(item.id))
  const requested = typeof searchParams.valtozat === 'string' ? searchParams.valtozat : null
  const initial =
    product.variants.find((variant) => variant.sku === requested) ??
    product.variants.find((variant) => effectiveOrderability(product, variant) === 'preorderable') ??
    product.variants[0]
  if (!initial) notFound()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(product, brand?.name ?? '')).replace(/</g, '\\u003c') }} />
      <Breadcrumbs
        items={[
          ...(brand ? [{ label: brand.name, href: `/marka/${brand.slug}` }] : []),
          ...(brand && category ? [{ label: category.name, href: `/marka/${brand.slug}/${category.slug}` }] : []),
          { label: product.name },
        ]}
      />
      {product.orderability === 'discontinued' ? (
        <Alert className="mb-6">
          <AlertTitle>Ez a termék megszűnt</AlertTitle>
          <AlertDescription>A terméket már nem forgalmazzuk, ezért nem rendelhető. Az oldal tájékoztató jelleggel érhető el.</AlertDescription>
        </Alert>
      ) : null}
      <ProductConfigurator product={product} initialSku={initial.sku} />

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_380px]">
        <Reveal>
          <section aria-labelledby="leiras">
            <h2 id="leiras" className="text-xl font-bold">
              Leírás
            </h2>
            <p className="mt-3 max-w-prose leading-relaxed">{product.description}</p>
            <h2 className="mt-8 text-xl font-bold">Specifikáció</h2>
            <div className="mt-3 overflow-hidden rounded-xl border">
              {product.specifications.map((group) => (
                <section key={group.title} className="border-b last:border-b-0">
                  <h3 className="bg-muted px-4 py-2 text-sm font-semibold">{group.title}</h3>
                  <dl className="divide-y">
                    {group.items.map((item) => (
                      <div key={item.label} className="grid grid-cols-[40%_1fr] gap-4 px-4 py-2 text-sm">
                        <dt className="text-muted-foreground">{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </section>
        </Reveal>
        <Reveal delay={0.1}>
          <aside className="rounded-xl bg-muted p-5 text-sm" aria-labelledby="menete">
            <h2 id="menete" className="text-base font-bold">
              Az előrendelés menete
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Kosárba teszi a kívánt változatot, és leadja az előrendelést.</li>
              <li>E-mailben visszaigazoljuk, majd megkezdjük a beszerzést.</li>
              <li>Ha a beszerzési ár változna, árváltozási ajánlatot küldünk – az ár csak az Ön elfogadásával módosul.</li>
              <li>Fizetés személyes átvételkor vagy kiszállításkor. Online fizetés nincs.</li>
            </ol>
          </aside>
        </Reveal>
      </div>
    </div>
  )
}
