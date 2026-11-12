import { SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import type React from "react";

import { type BreadcrumbEntry, Breadcrumbs } from "@/components/Breadcrumbs";
import { ListingFilters } from "@/components/product/ListingFilters";
import { ListingTransitionProvider } from "@/components/product/ListingTransitionProvider";
import { ProductCatalog } from "@/components/product/ProductCatalog";
import { ProductSearch } from "@/components/product/ProductSearch";
import { ProductSort } from "@/components/product/ProductSort";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/shadcn/button";
import { DEFAULT_PRODUCT_SORT } from "@/config/shop";
import { getBrands } from "@/dto/brands";
import { getCategories } from "@/dto/categories";
import { getProductFacets } from "@/dto/products";
import { listingQueryToParams } from "@/schemas/listing";
import type { ProductQuery } from "@/types/catalog";

/**
 * Column widths and gaps shared by every listing cell. minmax(0,1fr): the main column always
 * takes the full remaining width, never its min-content.
 */
const LISTING_GRID: string =
  "mt-8 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-x-8 items-start";

type CatalogListingProps = {
  title: string;
  description: string | null;
  basePath: string;
  breadcrumbs: BreadcrumbEntry[];
  query: ProductQuery;
  /** Brand/category fixed by the route (not shown as filters). */
  lockBrand?: boolean;
  lockCategory?: boolean;
  /** Quick links (e.g. categories of a brand). */
  chips?: { label: string; href: string }[];
};

/** Server-rendered listing shared by /termekek, brand, category and brand+category pages. */
export async function CatalogListing(
  props: CatalogListingProps
): Promise<React.JSX.Element> {
  const [facets, brands, categories] = await Promise.all([
    getProductFacets(props.query),
    getBrands(),
    getCategories(),
  ]);
  const omit: ("brand" | "category")[] = [
    ...(props.lockBrand ? ["brand" as const] : []),
    ...(props.lockCategory ? ["category" as const] : []),
  ];
  // Params each no-JS form keeps besides its own field (the page always resets).
  const paramsWithout = (own: Partial<ProductQuery>): [string, string][] => [
    ...listingQueryToParams(
      { ...props.query, ...own, page: undefined },
      omit
    ).entries(),
  ];
  const filterProps = {
    action: props.basePath,
    facets,
    brands,
    categories,
    lockBrand: props.lockBrand ?? false,
    lockCategory: props.lockCategory ?? false,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={props.breadcrumbs} />
      <Reveal>
        <h1 className="text-3xl font-bold sm:text-4xl">{props.title}</h1>
        {props.description ? (
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </Reveal>
      {props.chips?.length ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {props.chips.map((chip) => (
            <li key={chip.href}>
              <Button asChild variant="outline" size="sm">
                <Link href={chip.href}>{chip.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* One transition for search, sorting and sidebar filters, so the newest navigation always wins. */}
      <ListingTransitionProvider>
        {/*
          One grid for the whole listing (LISTING_GRID). Desktop: 2 columns x 2 rows, so the controls
          share the catalog's column and the filters start on the catalog's row. Mobile: one column
          with search + sort, the collapsible filter panel, then the catalog.
        */}
        <section aria-labelledby="talalatok" className={LISTING_GRID}>
          {/* Structural top-left cell keeping the sidebar column: empty, never focusable, desktop only. */}
          <div aria-hidden="true" className="hidden lg:block" />
          <div className="min-w-0 space-y-3">
            <ProductSearch
              action={props.basePath}
              preservedParams={paramsWithout({ search: undefined })}
            />
            <ProductSort
              action={props.basePath}
              sort={props.query.sort ?? DEFAULT_PRODUCT_SORT}
              preservedParams={paramsWithout({ sort: undefined })}
            />
          </div>
          <aside aria-label="Szűrés" className="min-w-0">
            {/* Collapsible on small screens, always visible on desktop; both work without JavaScript. */}
            <details className="rounded-xl border p-4 lg:hidden">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
                Szűrés
              </summary>
              <div className="mt-4">
                <ListingFilters idPrefix="m" {...filterProps} />
              </div>
            </details>
            <div className="hidden lg:block">
              <ListingFilters idPrefix="d" {...filterProps} />
            </div>
          </aside>
          <div className="min-w-0">
            <ProductCatalog
              pageSize={9}
              query={props.query}
              basePath={props.basePath}
              brands={brands}
              omit={omit}
            />
          </div>
        </section>
      </ListingTransitionProvider>
    </div>
  );
}
