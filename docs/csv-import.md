# CSV import

Admin-only. Demonstrated in sample mode at `/fejlesztes` → *CSV termékimport*, with a **dry-run preview** and an **apply** button. Entry points: `importService.previewImport(csv, auth)` and `importService.applyImport(csv, auth)`.

Example file: [`public/minta/termekimport-minta.csv`](../public/minta/termekimport-minta.csv).

## Format

- UTF-8 (a BOM is accepted), **semicolon (`;`) delimiter** (Hungarian Excel default), RFC 4180 quoting (`"…"`, `""` inside quotes), CRLF or LF. Max 1 MB.
- First row is the header. `product_id` and `sku` are required. Unknown columns reject the file. **Columns you omit are never touched.**
- One row = one variant. Rows with the same `product_id` are grouped into one product.

| Column | Level | Notes |
| --- | --- | --- |
| `product_id` | product | Stable id, `[a-z0-9-]`, e.g. `prod-pixel-10`. Identity for create/update. |
| `product_slug`, `product_name` | product | Required when creating. |
| `model`, `description` | product | |
| `brand_slug` (+ `brand_name`) | product | Unknown slug + name → brand created. Unknown slug without name → error. |
| `category_slugs` (+ `category_names`) | product | `\|`-separated, names aligned by position. Unknown without name → error. |
| `status` | product | `draft` / `published` (new products default to `draft`). |
| `featured` | product | `igen`/`nem` (also `true`/`false`/`1`/`0`). |
| `product_orderability`, `variant_orderability` | | `preorderable`, `temporarily_unavailable`, `discontinued` (Hungarian aliases `elorendelheto`, `nem_rendelheto`, `megszunt`). |
| `sku` | variant | `[A-Z0-9-]`, unique across all products. |
| `color_hex` | variant | `#RRGGBB` only (normalized to uppercase), same rule as Payload and sample data. |
| `color_label`, `storage_gb`, `ram_gb`, `case_size_mm` | variant | |
| `price_huf` | variant | Integer forints, required for new variants. |
| `procurement_min_days`, `procurement_max_days` | variant | Integers; min ≤ max. |
| `image_keys` | variant | `\|`-separated **existing** media object keys of that product. URLs are rejected (no remote downloads, so no SSRF surface). |

Product-level values may appear on any row of the group. Conflicting non-empty values in the same group are an error.

## Rules

- **Create** a product when `product_id` is new, and a variant when its SKU is new.
- **Update** only the provided non-empty cells. Empty cells and omitted columns keep their stored values.
- **Skip** when nothing would change, which makes re-importing the same file idempotent (all "kihagyva").
- **Never delete** products or variants that are absent from the file.
- **SKU conflicts**: a SKU owned by another product, or repeated in the file, is a row error.
- **Errors are row-level** (row number, column, Hungarian message). A product group with any error is skipped entirely. Other groups still apply.
- Counts are reported for products and variants: created / updated / skipped / failed, plus created brands and categories.
- Sample mode: new variants without `image_keys` get a generated placeholder at `brand/category/product/color/elolnezet.svg`.

## Future persistent imports

- Upload the file to storage, then process it in an authenticated background job in batches (Vercel function time limits). Persist progress per row group so an interrupted import can resume. Each product group gets its own transaction.
- Real images: upload through the Payload media collection (validated MIME and size), then reference the resulting object keys. If remote URLs are ever allowed, fetch server-side with an allowlist of hosts, block private and link-local IP ranges (after DNS resolution), cap size and timeout, and disallow redirects to other hosts.
