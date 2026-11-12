import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import type React from "react";

import { PopularSelector } from "@/components/home/PopularSelector";
import { ProductCard } from "@/components/product/ProductCard";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/shadcn/button";
import { getBrands, getPopularBrands } from "@/dto/brands";
import { getPopularCategories } from "@/dto/categories";
import { getProducts } from "@/dto/products";
import { getStoreSettings } from "@/dto/settings";
import type { Brand } from "@/types/catalog";

export default async function HomePage(): Promise<React.JSX.Element> {
  const [settings, featured, brands, popularBrands, popularCategories] =
    await Promise.all([
      getStoreSettings(),
      getProducts({ featuredOnly: true, pageSize: 8 }),
      getBrands(),
      getPopularBrands(3),
      getPopularCategories(3),
    ]);
  const brandsById = new Map(brands.map((brand: Brand) => [brand.id, brand]));

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,0,0,0.35),transparent_45%)]"
        />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 md:py-24">
          <Reveal>
            <p className="font-heading text-sm font-semibold tracking-[0.2em] text-white/70 uppercase">
              Előrendelés
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl">
              {settings.homepage.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-white/80">
              {settings.homepage.heroText}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/termekek">
                  Termékek böngészése
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/gyik">Hogyan működik?</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <PopularSelector
          id="nepszeru-markak"
          title="Népszerű márkák"
          items={popularBrands.map((brand) => ({
            key: brand.id,
            label: brand.name,
            description: brand.description,
            href: `/marka/${brand.slug}`,
          }))}
          viewAll={{ label: "Összes márka", href: "/markak" }}
        />
        <PopularSelector
          id="nepszeru-kategoriak"
          title="Népszerű kategóriák"
          items={popularCategories.map((category) => ({
            key: category.id,
            label: category.name,
            description: category.description,
            href: `/kategoria/${category.slug}`,
          }))}
          viewAll={{ label: "Összes kategória", href: "/kategoriak" }}
          delay={0.08}
        />
      </div>

      <section
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6"
        aria-labelledby="kiemelt"
      >
        <Reveal>
          <div className="flex items-end justify-between gap-4">
            <h2 id="kiemelt" className="text-2xl font-bold">
              {settings.homepage.featuredHeading}
            </h2>
            <Link
              href="/termekek"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold whitespace-nowrap text-primary hover:underline"
            >
              Összes termék
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
        <Reveal>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {featured.items.map((product, index: number) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  brandName={brandsById.get(product.brandId)?.name ?? ""}
                  priority={index < 4}
                />
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="bg-muted" aria-labelledby="elonyok">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <h2 id="elonyok" className="sr-only">
            Miért nálunk?
          </h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {settings.homepage.highlights.map((highlight, index: number) => (
              <li key={highlight.title}>
                <Reveal delay={index * 0.08}>
                  <h3 className="text-lg font-bold">{highlight.title}</h3>
                  <p className="mt-1 text-muted-foreground">{highlight.text}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
