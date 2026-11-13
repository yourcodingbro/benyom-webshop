# CSV import

Admin-only, in the Payload admin at **Termékimport (CSV)** (`/admin/termekimport`): template download, upload, server-side **dry run** with row-level errors, then an explicit **apply**. Entry points: `importService.createJob` / `runJob` (persisted jobs), plus `previewImport` / `applyImport` for scripts and tests.

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
| `color_hex` | variant | `#RRGGBB` only (normalized to uppercase), same rule as the admin form (Payload). |
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
- Products are written through Payload, so the same validation applies as in the admin form (SKU format and uniqueness, HEX, slug, prices).

## Persisted jobs, limits and resumption

- Each upload becomes an `import-jobs` record with the CSV, the dry-run report, status, per-group results and the final report.
- Applying processes product groups in batches of at most ~20 seconds per request (Vercel function limits); the admin page calls the next batch until the job is `completed`. Every finished product group is recorded immediately, so an interrupted run resumes without redoing or losing work (a job whose heartbeat is older than 2 minutes can be taken over).
- A failed group is recorded with its error and the rest continues. Re-running a completed job changes nothing; importing the same file again reports everything as unchanged.
- Images: `image_keys` must reference media already uploaded for that product (Médiatár). Remote URLs are rejected, so there is no server-side download (no SSRF surface).
