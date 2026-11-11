# Catalog and variants

## Brands and categories

Brands (`Apple`, `Samsung`) and categories (`mobiltelefon`, `tablet`, `okosora`) are separate entities. A product has one brand and one or more categories. Brand navigation is **generated from product data** by `catalogService.getNavigation()`: each brand lists only the categories it has listable products in. Categories are never duplicated per brand.

Routes: `/marka/{brand}`, `/marka/{brand}/{category}`, `/kategoria/{category}`, `/termekek`.

## Listing, search, filters

`getProducts(query)` supports:
- search across name, model, brand and every variant SKU (case- and accent-insensitive, all tokens must match),
- filters: brand, category, colors (HEX), storage, min/max price (a product matches if **any** variant matches all filters),
- sorting: featured, price ↑/↓ (by lowest variant price), name (Hungarian collation), newest,
- pagination (12 per page), plus facets computed before the color/storage/price filters.

URL parameters (shareable, parsed leniently by `schemas/listing.ts`): `q`, `marka`, `kategoria`, `szin=1c1c1e,e8742a`, `tarhely=256,512`, `ar_min`, `ar_max`, `rendezes`, `oldal`. The filter form is a plain GET form, so it works without JavaScript.

Listings hide **draft** and **discontinued** products. Discontinued product pages stay reachable with a notice and cannot be ordered.

## Orderability

`preorderable` | `temporarily_unavailable` | `discontinued`, on both product and variant. The product level overrides the variant (`effectiveOrderability`). The UI never shows stock quantities. Only "Előrendelhető", "Átmenetileg nem rendelhető" or "Megszűnt termék" appear, plus an optional *estimated* procurement time ("becslés, nem garantált").

## Variants

A variant has its own SKU, price, orderability, optional procurement estimate and image ids. Attributes are `colorHex`, `colorLabel` (optional), `storageGb`, `ramGb`, `caseSizeMm`. Only dimensions with more than one value get a selector.

Selection rule (product page, `ProductConfigurator`): choosing a value picks the existing variant that keeps the most current selections, preferring orderable ones. You can therefore never land on a non-existent combination. Options that don't combine with the current selection are dimmed and labeled "más változattal együtt választható". Combinations that are not orderable are struck through, labeled "nem rendelhető", and the add-to-cart button is disabled. The URL reflects the selection (`?valtozat=SKU`), and the server preselects it.

SKUs are never derived from colors (e.g. `APL-IP17P-512-02`).

## HEX colors

- Stored form: uppercase `#RRGGBB`. `normalizeHexColor()` (`lib/hex.ts`) accepts only `#` plus 6 hex digits (surrounding whitespace trimmed). Anything else is rejected.
- The same rule is used by sample data (a startup check in `sample.ts`, plus a test), Payload (`hexColorField` validate + normalizing `beforeChange` hook) and CSV import.
- No color name is required. `colorLabel` is optional; without it the HEX value is the accessible label.
- Media path segment: lowercase without `#` (`000000`), via `hexToPathSegment()`.

## Swatches (accessibility)

- Square swatches built on native radio inputs (keyboard arrows work, one tab stop per group). Filters use native checkboxes.
- Each input has an explicit `aria-label`, e.g. `Narancs (#E8742A)` or `#A8B89A`, plus state notes.
- Selected: thick ring and a check icon (not color alone). Unavailable: red diagonal strike and a text note. Focus: a 3px outline on the visible swatch (`peer-focus-visible`). Hover: slight scale.
- Light colors (luminance > 0.6) get a darker border.
- The selected variant's color appears as a swatch plus text in the cart, checkout review, confirmation and emails.

## Images

Sample images are generated SVG placeholders served by `/sample-media/{brand}/{category}/{product}/{hex}/{file}.svg`. Only validated slugs and HEX values are used. Each image record stores an explicit `objectKey` (`buildMediaObjectKey()`), and variants reference images by id, so images can be shared across storage sizes. See [deployment.md](deployment.md#supabase-storage) for real media.

## Popular brands and categories

`Brand.popularityRank` and `Category.popularityRank` are an **explicit editorial ranking** (1 = most popular). In sample mode they are set in `src/sample.ts`; in Payload they are admin-edited number fields. They are **not** sales statistics. `getPopularBrands(3)` / `getPopularCategories(3)` feed the homepage blocks; *Összes márka* (`/markak`) and *Összes kategória* (`/kategoriak`) list everything with links to the brand, brand+category and category listings.

## Product card quick add

`ProductCard` is a compact preview that reuses the product page's selection rules (`lib/variant-selection.ts` via `useVariantSelection`) and the same cart (`useCart().addItem` → server quote):
- Nothing is preselected unless only one option exists. The customer must choose every required dimension; dimensions fully determined by others (e.g. RAM fixed by storage) are not asked and are shown in the summary instead.
- Choosing a value that doesn't combine with an earlier choice drops that earlier choice, so the selection is always a valid partial combination.
- Price shows the range of still-matching variants until the exact variant is resolved; image follows the chosen color; the availability badge follows the resolved variant.
- "Kosárba" with an incomplete selection shows which attributes are missing; unavailable variants disable the button. On success the exact SKU is added, an inline confirmation appears and the cart drawer opens.
- Controls are stacked above the card's stretched title link (`relative z-10`), so taps and clicks on swatches and buttons never navigate. All controls are native radios/buttons (keyboard: Tab between groups, arrows within a group).
