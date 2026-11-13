# Catalog and variants

## Brands and categories

Brands (`Apple`, `Samsung`) and categories (`mobiltelefon`, `tablet`, `okosora`) are separate entities. A product has one brand and one or more categories. Brand navigation is **generated from product data** by `catalogService.getNavigation()`: each brand lists only the categories it has listable products in. Categories are never duplicated per brand.

Routes: `/marka/{brand}`, `/marka/{brand}/{category}`, `/kategoria/{category}`, `/termekek`.

## Listing, search, filters

`getProducts(query)` supports:
- search across name, model, brand and every variant SKU (case- and accent-insensitive, all tokens must match),
- filters: brand, category, colors (HEX), storage, min/max price (a product matches if **any** variant matches all filters),
- sorting: featured (**default, "Kiemelt"**: featured first), price ↑/↓ (by lowest variant price), name (Hungarian collation), newest. Every order ends with name and then id as tie-breakers, so pages never overlap or swap items. The default is applied in `getProducts` itself (`DEFAULT_PRODUCT_SORT` in `config/shop.ts`) as well as in the UI; an explicit `rendezes` from the URL always wins,
- pagination (`pageSize`, chosen by the caller; without one, the 48-item maximum), plus facets computed before the color/storage/price filters.

URL parameters (shareable, parsed leniently by `schemas/listing.ts`): `q`, `marka`, `kategoria`, `szin=1c1c1e,e8742a`, `tarhely=256,512`, `ar_min`, `ar_max`, `rendezes`, `oldal`.

### Toolbar and live search

`CatalogListing` (server) renders one `<section>` on a single grid (`LISTING_GRID`: one shared definition of column widths `260px | minmax(0,1fr)` and gaps). On desktop (`lg`) it has 2 columns and 2 rows: an empty, `aria-hidden` top-left cell that only reserves the sidebar column; search + sort top-right; the filter sidebar bottom-left (with the reserved clear-button space); and the catalog bottom-right. So the controls line up exactly with the listing column, and the filters and the listing start on the same row. On mobile the grid is one column and the empty cell is not rendered (`hidden lg:block`): search + sort, the collapsible filter panel, then the catalog. The sidebar's filter options come from `getProductFacets(query)` (same base set as `getProducts`, no paging), so the catalog's paged query stays inside `ProductCatalog`. The parts are separate components:
1. `ProductSearch` (client): full-width pill search field. Its state and URL sync live in `useDebouncedSearchParam`.
2. `ProductSort` (client): sorting in its own row, aligned right (shadcn `Select`, pill trigger, rounded panel). It writes the URL through `useListingUrl`.
3. `ProductCatalog` (server): result count, product grid, empty state and `Pagination`, inside `ListingResults`.

There is no separate client state or fetch effect: the URL is the shared query state. `CatalogListing` parses it, calls `getProducts` once and passes typed props down. Each component changes the URL only through the existing hooks, and the server re-renders. Search and sort are separate GET forms; each keeps the other params as hidden fields for use without JavaScript.

### Automatic sidebar filters

The sidebar (`ListingFilters`, client) has no "Apply" button. Price comes first, then brand and category (shadcn `Select`), colors and storage. `useListingFilters` (`src/hooks/`):
- applies checkboxes and dropdowns immediately (one history entry each, so Back steps through filter changes);
- applies price inputs 300 ms after typing stops (`replace`, no history entries). The fields accept free typing (`150 000` and `1.000.000` are fine). `checkPriceRange` (`lib/price-filter.ts`) validates; an invalid range (non-integer, over 100 000 000, or max < min) shows an error after the debounce and is **not** applied, so the URL keeps the last valid range;
- shows **Szűrők törlése** (pill `Button`, `FilterX` icon) above the filters whenever a sidebar filter is set. The button is always rendered so its space is reserved and toggling it never moves the sidebar; when inactive it is `invisible` (hidden from the tab order and assistive technology), `disabled` and `aria-hidden`. After clearing, focus moves to the minimum price field. It clears all of them, including price and excluding route-fixed brand/category, in one navigation, keeping search and sort;
- re-syncs the controls when the URL changes from outside (Back/Forward, links); its own in-flight requests never overwrite newer local edits.

### Page size

The page size is not a URL parameter and there is no selector. It is set once, at the call site in `CatalogListing`: `<ProductCatalog pageSize={9} />`, the same on every screen size. `ProductCatalog` (async server component) passes it to `getProducts`, so exactly 9 products are fetched; page counts and `Pagination` use the same value, and the last page may have fewer. Only the grid's column count is responsive.

All listing navigations (search, sort, filters) go through `useListingUrl`. It reads the live URL, always removes `oldal` (page 1), skips no-op URLs, and runs in one shared transition (`ListingTransitionProvider` wraps the sidebar and the results), so the newest navigation wins. The mobile filter panel (`<details>`) renders the same component with the same behavior.

Without JavaScript, search, sort and the sidebar are GET forms with `<noscript>` submit buttons. The brand/category/sort dropdowns need JavaScript to open; price, colors and storage still work.

- `useDebouncedSearchParam` (`src/hooks/`): the input updates immediately; the URL is replaced (`router.replace`, so no history entry per keystroke) 300 ms after the last keystroke (`SEARCH_DEBOUNCE_MS`). Clearing applies at once. The page (`oldal`) is reset, and sorting and all other filters are kept. Enter applies immediately; no button is needed.
- The server re-renders the listing through the existing `getProducts` search. Navigations run in a shared React transition (`ListingTransitionProvider`), so the newest one wins and an older response cannot overwrite newer results. Only explicit applies write the URL (no effect does), and identical URLs are skipped, so there are no duplicate requests.
- Back/forward (or links) that change `q` update the input. A response to our own earlier request never overwrites text typed after it.
- Changing the sort is an explicit choice and uses `router.push` (one history entry), resetting the page.
- While loading, the input shows a spinner, the results are dimmed with `aria-busy`, and screen readers hear "Keresés folyamatban…". The empty state names the search term and offers "Keresés törlése" (keeps other filters) and "Összes szűrő törlése".
- Without JavaScript search and sort are plain GET forms (Enter submits the search; a `<noscript>` *Alkalmaz* button applies the sort).

Listings hide **draft** and **discontinued** products. Discontinued product pages stay reachable with a notice and cannot be ordered.

## Orderability

`preorderable` | `temporarily_unavailable` | `discontinued`, on both product and variant. The product level overrides the variant (`effectiveOrderability`). The UI never shows stock quantities. Only "Előrendelhető", "Átmenetileg nem rendelhető" or "Megszűnt termék" appear, plus an optional *estimated* procurement time ("becslés, nem garantált").

## Variants

A variant has its own SKU, price, orderability, optional procurement estimate and image ids. Attributes are `colorHex`, `colorLabel` (optional), `storageGb`, `ramGb`, `caseSizeMm`. Only dimensions with more than one value get a selector.

Selection rule (product page, `ProductConfigurator`): choosing a value picks the existing variant that keeps the most current selections, preferring orderable ones. You can therefore never land on a non-existent combination. Options that don't combine with the current selection are dimmed and labeled "más változattal együtt választható". Combinations that are not orderable are struck through, labeled "nem rendelhető", and the add-to-cart button is disabled. The URL reflects the selection (`?valtozat=SKU`), and the server preselects it.

SKUs are never derived from colors (e.g. `APL-IP17P-512-02`).

## HEX colors

- Stored form: uppercase `#RRGGBB`. `normalizeHexColor()` (`lib/hex.ts`) accepts only `#` plus 6 hex digits (surrounding whitespace trimmed). Anything else is rejected.
- The same rule is used by Payload (`hexColorField` validate + normalizing `beforeChange` hook, so the admin form, the API and imports all agree), the CSV import and the initial dataset.
- No color name is required. `colorLabel` is optional; without it the HEX value is the accessible label.
- Media path segment: lowercase without `#` (`000000`), via `hexToPathSegment()`.

## Swatches (accessibility)

- Variant colors (product page and cards) use `ColorSwatch` (`components/product/ColorSwatch.tsx`): a square `<button type="button">` with `aria-pressed`, filled from the admin HEX code. `VariantOptions` decides which colors combine and passes only `name`, `code`, `selected`, `disabled` and `onSelect`. Other dimensions stay native radio pills. Filters use native checkboxes with the decorative `ColorDot` (also used in the cart and checkout).
- The swatch’s accessible name and tooltip is its `name`, e.g. `Narancs (#E8742A)` plus state notes; with no color name in the admin it falls back to the HEX code (`#A8B89A`). Color names stay optional; only the HEX is required.
- Selected: thick ring and a check icon (not color alone). Disabled (this combination cannot be ordered): dimmed, red diagonal strike, `aria-disabled`; it stays focusable so its tooltip and note can be read, but clicking does nothing (change another option first). Colors that do not combine with the other choices stay selectable but dimmed. Focus: a 3px outline. Hover: slight scale.
- Light colors (luminance > 0.6) get a darker border.
- The selected variant's color appears as a swatch plus text in the cart, checkout review, confirmation and emails.

## Images

Product images are Payload media stored in Supabase Storage at `brand/category/product/[color]/filename` (explicit `objectKey`, never parsed back into relations) and served from the public bucket. Variants reference images by id, so images can be shared across storage sizes. The initial import uploads WebP renderings of the original placeholders. See [deployment.md](deployment.md#supabase-storage).

## Popular brands and categories

`Brand.popularityRank` and `Category.popularityRank` are an **explicit editorial ranking** (1 = most popular). They are admin-edited number fields (initial values come from the initial import). They are **not** sales statistics. `getPopularBrands(3)` / `getPopularCategories(3)` feed the homepage blocks; *Összes márka* (`/markak`) and *Összes kategória* (`/kategoriak`) list everything with links to the brand, brand+category and category listings.

## Product card quick add

`ProductCard` is a compact preview that reuses the product page's selection rules (`lib/variant-selection.ts` via `useVariantSelection`) and the same cart (`useCart().addItem` → server quote):
- Nothing is preselected unless only one option exists. The customer must choose every required dimension; dimensions fully determined by others (e.g. RAM fixed by storage) are not asked and are shown in the summary instead.
- Choosing a value that doesn't combine with an earlier choice drops that earlier choice, so the selection is always a valid partial combination.
- Price shows the range of still-matching variants until the exact variant is resolved; image follows the chosen color; the availability badge follows the resolved variant.
- Quantity and "Kosárba" share one row (stepper left, button filling the rest, equal 36 px height). A container query hides the button label in narrow cards (two-column phone grid); its accessible name stays.
- A shared `QuantitySelector` (minus / editable input / plus, Arrow Up/Down) sets the quantity: positive integers only, decrement disabled at 1, typed values validated (`lib/quantity.ts`). The server validates quantities again (`cartLinesSchema`).
- "Kosárba" with an incomplete selection or invalid quantity shows what is missing; unavailable variants disable the button. On success the exact SKU and quantity are added (an existing line is increased), an inline confirmation shows the added and total quantity, and the cart drawer opens.
- There is no stock limit (no inventory). The existing per-line order cap (`MAX_LINE_QUANTITY`, 5) still applies and is reported instead of silently clamping.
- Controls are stacked above the card's stretched title link (`relative z-10`), so taps and clicks on swatches and buttons never navigate. All controls are native radios/buttons (keyboard: Tab between groups, arrows within a group).
