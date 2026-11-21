# CSV import

Admin-only, in the Payload admin under **Termékimportok** (`/admin/collections/import-jobs`): the list is the history; *Új létrehozása* offers the template download, upload and server-side **dry run** with row-level errors; the record's detail view shows the reports and the explicit **apply** (see [admin-operations.md](admin-operations.md#csv-import-termékimportok)). Entry points: `importService.createJob` / `runJob` (persisted jobs), plus `previewImport` / `applyImport` for scripts and tests.

Example file: [`public/minta/termekimport-minta.csv`](../public/minta/termekimport-minta.csv).

## Format

- UTF-8 (a BOM is accepted), **semicolon (`;`) delimiter** (Hungarian Excel default), RFC 4180 quoting (`"…"`, `""` inside quotes), CRLF or LF. Max 1 MB.
- First row is the header. `sku` is required. Unknown columns reject the file. **Columns you omit are never touched.**
- One row = one variant. Rows with the same `product_id` are grouped into one product; rows without `product_id` are grouped by `product_slug` (or, when that is empty too, by the slug derived from `product_name`), so give every row of such a product the same slug or name.

| Column | Level | Notes |
| --- | --- | --- |
| `product_id` | product | Optional. Existing id (e.g. `prod-pixel-10` or a UUID) identifies the product and is never regenerated. Empty: the product with the same slug is updated, otherwise a new product is created with a server-generated UUID. A new, non-empty id is used as given. |
| `product_slug`, `product_name` | product | Name required when creating. Without a slug it is derived from the name. |
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
| `specifications` | product | JSON array, same structure as the admin **Specifikáció** field and the product page. Blank keeps the stored specifications, `[]` clears them. See [Specifications](#specifications). |

Product-level values may appear on any row of the group. Conflicting non-empty values in the same group are an error.

## Specifications

The `specifications` cell holds the product's whole specification list as a JSON array of groups. Each group has a `title` and `items` of `label`/`value` pairs: the structure of the admin **Specifikáció** field, shown on the product page.

```json
[
  { "title": "Kijelző", "items": [{ "label": "Méret", "value": "6,67 hüvelyk" }, { "label": "Típus", "value": "LTPO AMOLED, 120 Hz" }] },
  { "title": "Akkumulátor", "items": [{ "label": "Kapacitás", "value": "5150 mAh" }] }
]
```

**Escaping in the CSV.** JSON contains double quotes, so the cell must be quoted (RFC 4180): wrap the whole JSON in `"…"` and double every `"` inside it. Semicolons, commas and line breaks inside the quoted cell are then part of the value. The JSON above, written as one line, becomes this cell:

```text
"[{""title"":""Kijelző"",""items"":[{""label"":""Méret"",""value"":""6,67 hüvelyk""},{""label"":""Típus"",""value"":""LTPO AMOLED, 120 Hz""}]},{""title"":""Akkumulátor"",""items"":[{""label"":""Kapacitás"",""value"":""5150 mAh""}]}]"
```

Excel and LibreOffice do this automatically when you paste the JSON into a cell and save as CSV (semicolon-separated, UTF-8). The first Nothing Phone (3) row of the sample file has a complete example.

- **Validation:** `title`, `label` and `value` are required, non-empty strings (surrounding spaces are trimmed); `items` may be empty. Unknown keys, duplicate group titles and duplicate labels within a group are row errors in the `specifications` column, with the location (e.g. "1. csoport, 2. tulajdonság"). Invalid JSON is reported with a hint about quoting.
- **Blank cell or no column:** the stored specifications are kept.
- **`[]`:** all specifications are removed.
- **Non-empty value:** it replaces the product's whole list, with groups and items in the given order. Nothing is appended, so importing the same file again changes nothing.
- **Multi-row products:** put the cell on the product's main row (any one row of the group works) and leave it blank on the others. Two different values in the same product's rows (including `[]` against a list) are a conflict, and the whole product group fails.
- **Preview:** before you apply, the dry-run report lists per product what changes under "Specifikáció változások": added and removed `Csoport › Megnevezés` entries, changed values (`régi → új`), or that everything is cleared.

## Rules

- **Create** a product when `product_id` is new (or empty with an unknown slug), and a variant when its SKU is new.
- **Update** only the provided non-empty cells. Empty cells and omitted columns keep their stored values.
- **Skip** when nothing would change, which makes re-importing the same file idempotent (all "kihagyva").
- **Never delete** products or variants that are absent from the file.
- **SKU conflicts**: a SKU owned by another product, or repeated in the file, is a row error.
- **Errors are row-level** (row number, column, Hungarian message). A product group with any error is skipped entirely. Other groups still apply.
- Counts are reported for products and variants: created / updated / skipped / failed, plus created brands and categories.
- Products are written through Payload, so the same validation applies as in the admin form (SKU format and uniqueness, HEX, slug, prices).

## Persisted jobs, limits and resumption

- Each upload becomes an `import-jobs` record with the CSV, the dry-run report, status, per-group results and the final report.
- Applying processes product groups in batches of at most ~20 seconds per request (Vercel function limits); the detail view calls the next batch until the job is `completed`. Every finished product group is recorded immediately, so an interrupted run resumes without redoing or losing work (a job whose heartbeat is older than 2 minutes can be taken over).
- A failed group is recorded with its error and the rest continues. A job that failed as a whole (unexpected error) can be retried from its detail view: it resumes and skips the groups recorded before the failure. Re-running a completed job changes nothing; importing the same file again reports everything as unchanged.
- Images: `image_keys` must reference media already uploaded for that product (Médiatár). Remote URLs are rejected, so there is no server-side download (no SSRF surface).
