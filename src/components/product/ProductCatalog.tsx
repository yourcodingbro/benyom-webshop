import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import type React from "react";

import { ListingResults } from "@/components/product/ListingTransitionProvider";
import { Pagination } from "@/components/product/Pagination";
import { ProductCard } from "@/components/product/ProductCard";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/shadcn/button";
import { getProducts } from "@/dto/products";
import { listingQueryToParams } from "@/schemas/listing";
import type { Brand, Product, ProductQuery } from "@/types/catalog";

type ProductCatalogProps = {
  /** Products per page on every screen size; the DTO query, page count and pagination all use it. */
  pageSize: number;
  /** Parsed listing URL (search, filters, sort, page) plus the route's brand/category. */
  query: ProductQuery;
  basePath: string;
  brands: Brand[];
  /** Route-fixed params left out of generated links. */
  omit: ReadonlyArray<"brand" | "category">;
};

/**
 * Server-rendered product grid with result count, empty state and pagination. Fetches exactly one
 * page of `pageSize` products through the DTO (the last page may have fewer).
 */
export async function ProductCatalog(
  props: ProductCatalogProps
): Promise<React.JSX.Element> {
  const { query } = props;
  const result = await getProducts({ ...query, pageSize: props.pageSize });
  const brandsById = new Map(
    props.brands.map((brand: Brand) => [brand.id, brand])
  );
  const withoutSearch = listingQueryToParams(
    { ...query, search: undefined, page: undefined },
    props.omit
  ).toString();
  const withoutSearchHref = withoutSearch
    ? `${props.basePath}?${withoutSearch}`
    : props.basePath;

  return (
    <ListingResults>
      <h2
        id="talalatok"
        className="mb-4 text-sm font-semibold text-muted-foreground"
        aria-live="polite"
      >
        {result.totalItems} termék
        {result.totalPages > 1
          ? ` · ${result.page}. / ${result.totalPages} oldal`
          : ""}
      </h2>
      {result.items.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          role="status"
        >
          <SearchXIcon
            className="mx-auto mb-2 size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-semibold">
            {query.search
              ? `Nincs találat erre: „${query.search}”.`
              : "Nincs a feltételeknek megfelelő termék."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Próbáljon más keresőszót vagy kevesebb szűrőt.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {query.search ? (
              <Button asChild variant="outline" size="sm">
                <Link href={withoutSearchHref}>Keresés törlése</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={props.basePath}>Összes szűrő törlése</Link>
            </Button>
          </div>
        </div>
      ) : (
        <Reveal>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {result.items.map((product: Product, index: number) => (
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
      )}
      <Pagination
        basePath={props.basePath}
        query={query}
        page={result.page}
        totalPages={result.totalPages}
        omit={props.omit}
      />
    </ListingResults>
  );
}
