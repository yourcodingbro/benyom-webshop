# Deployment and operations setup

Production runs on **Vercel** (Next.js + Payload admin), **Supabase PostgreSQL** (data, via Payload's Postgres adapter) and **Supabase Storage** (media, via `@payloadcms/storage-s3` on Supabase's S3-compatible endpoint). Email goes through **Resend**. Connection choices follow the current Supabase, Payload, Resend and Vercel documentation (checked 2026-11-13).

## Versions

Node 22.12+ · Next 16.4.6 · Payload 3.91.0 (`@payloadcms/db-postgres`, `@payloadcms/storage-s3` 3.91.0; 3.92+ needs Node ≥ 22.23.4) · React 19.3.1.

## Environment variables

All are server-side; see [.env.example](../.env.example) for placeholders and explanations. Validation lives in `src/config/env.ts` (zod): one error lists every missing or invalid variable by name, never by value. A `NEXT_PUBLIC_` copy of any secret is refused.

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_ENV` | always | `development` · `test` · `preview` · `production` |
| `DATABASE_URL` | always | Runtime. Vercel: Supabase **shared pooler, transaction mode, port 6543** (`postgres.<project-ref>` user), `sslmode=require` |
| `DATABASE_MIGRATION_URL` | recommended | Migrations + import: **direct connection** (IPv6, 5432) or **shared pooler session mode** (IPv4, 5432). Falls back to `DATABASE_URL` |
| `DATABASE_POOL_MAX` | no | Connections per instance (default 5) |
| `PAYLOAD_SECRET`, `APP_SIGNING_SECRET` | always | ≥ 32 random characters each |
| `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | production (all or none elsewhere) | Without them media uploads are refused (503); there is no local-disk fallback |
| `CRON_SECRET` | production | ≥ 16 characters; the GitHub Actions scheduler sends it as `Authorization: Bearer …`, so the repository secret of the same name must hold the same value ([Scheduler](#scheduler-github-actions)) |
| `EMAIL_MODE`, `RESEND_API_KEY` | for real email | the sender and the store address are admin settings (*Beállítások → Email beállítások*), not env; see [email.md](email.md#sender-and-store-address-store-settings) |
| `RESEND_WEBHOOK_SECRET` | for delivery tracking | `whsec_…` from the Resend webhook |
| `NEXT_PUBLIC_SITE_URL`, `ALLOW_INDEXING` | yes / no | public URL; indexing only in production with `true` |
| `ADMIN_TEMP_PASSWORD_TTL_HOURS` | no | Validity of an invited admin's temporary password in hours (1–720, default 72); see [admin-operations.md](admin-operations.md#admin-accounts-felhasználók) |

Local secrets go in `.env.local` (git-ignored). `npm run dev`, `npm run migrate*` and `npm run import:initial` all load it (Next.js and the Payload CLI read `.env`/`.env.local`).

## Database connections

- **Runtime** uses `DATABASE_URL`. Serverless functions open many short-lived connections, so Supabase recommends the transaction-mode pooler. The shared pooler does not support prepared statements in transaction mode; node-postgres (used by Payload's adapter) sends unnamed queries, so nothing is prepared across pooled transactions. Keep `DATABASE_POOL_MAX` low.
- **Migrations and the initial import** set `PAYLOAD_DB_TARGET=migration` (in the npm scripts) and use `DATABASE_MIGRATION_URL`: a direct connection (IPv6 by default; IPv4 needs Supabase's add-on) or the session-mode pooler on port 5432 from IPv4-only networks.
- Workflows that must be atomic (order changes with their audit entries and queued emails, proposal decisions, email job claims, import progress) run in explicit Payload transactions with `SELECT … FOR UPDATE` row locks through Payload's own adapter session (`src/dto/payload.ts`, `src/collections/utils/db.ts`). There is no parallel database client.

## Schema migrations

Schema changes ship as version-controlled migrations in `src/migrations/`. Payload `push` is disabled.

```bash
npm run migrate:status
npm run migrate
```

- `20261113_191624_initial`: all collections and globals, including unique indexes for idempotency (`orders.idempotency_key`, `email_messages.idempotency_key`, `email_events.event_id`, `contact_messages.submission_key`, `media.object_key`).
- `20261113_192000_order_events_append_only`: a trigger that rejects any `UPDATE` or `DELETE` on `order_events` (append-only audit trail, whatever the client).
- `20261113_203439_media_storage_fields`: adds the storage adapter columns `media.prefix` and `media._objectkey`. The initial migration had been generated without Supabase Storage configured, so the S3 plugin (which adds these fields) was inactive and they were missing; with storage configured every media query failed (`42703 column "prefix" does not exist`). The Media collection now declares both fields itself, so the schema is identical with or without `SUPABASE_*`.
- `20261113_204024_media_filename_per_prefix`: replaces the collection-wide unique `filename` index with a unique (`filename`, `prefix`) index (`upload.filenameCompoundIndex`), because every product image is called `elolnezet.webp` under its own `brand/category/product/[color]` prefix.
- `20261116_161931_admin_temporary_passwords`: temporary-password columns on `users` and the `admin-invitation` email template/category.
- `20261116_170823_product_identity_and_media_uploads`: `product_slug_reservations` (unique slug), `products.primary_category_id` (+ versions; backfilled with each product's first category), `media.upload_origin`. Additive; existing ids, slugs, object keys and relations are unchanged.
- `20261116_175758_slug_history_ordering_and_sales`: `product_slug_history`, `sale_entries`, `_order` on brands/categories (`COLLATE "C"`, initialized from the previous `sortOrder`, name, id), order handover timestamps, `orders_items.brand_id`/`category_ids` (backfilled by SKU from current products) and two audit event types. Additive.
- `20261116_205853_email_settings_in_store`: `store_settings.store_contact_email` and `email_from`, filled once from the former `CONTACT_EMAIL` / `EMAIL_FROM` env vars when empty (never overwriting); the old recipient columns become optional and unused. Additive.

When changing collections or plugins, generate migrations with the **same** storage configuration as production, and check for drift with `npm run migrate:create -- check --skip-empty` both with and without the `SUPABASE_*` variables: no file should be created.

To change the schema: edit collections, run `npm run migrate:create -- <name>` against a development database, review the SQL, commit it, then apply with `npm run migrate`. Never reset or drop a shared database; `down` migrations exist but are not run automatically.

**Production:** run `npm run migrate` from a trusted machine or CI with the production `DATABASE_MIGRATION_URL` **before** deploying code that needs the new schema (expand first, contract later). The build never touches the database.

**Delivery fees (`20261119_194111_delivery_fee_free_or_fixed`):** only `free` and `fixed` remain. If a stored delivery method still has the removed `unknown` mode (or a fixed fee without a whole, non-negative amount), the migration stops without changing anything and lists those methods. Give each one an explicit replacement by `methodId`, then run it again: `DELIVERY_FEE_REPLACEMENTS='{"csomagautomata":{"kind":"fixed","amount":1990}}' npm run migrate` (or `{"kind":"free"}`). No fee is invented, and orders keep the fees and totals they were placed with. Deploy the new code only after this migration has run: with a leftover `unknown` row the settings can no longer be read.

## Initial data import

```bash
npm run import:initial -- target-database=<database name> [skip-demo] [skip-media] [confirm-production]
```

- Refuses to run unless `target-database=` equals the database it is connected to (explicit identification). With `APP_ENV=production` it also needs `confirm-production` and **never** imports demo orders.
- Imports settings, brands, categories, products (stable text ids such as `prod-iphone-17`, unique SKUs, HEX colors), media and demo orders through the Local API, so the same validation and hooks apply as everywhere else.
- **Idempotent**: existing ids are skipped, existing slugs under another id are *mapped* (relationships follow the existing record), differences are reported as *conflict* and never overwritten, nothing is deleted. Each run prints created / skipped / mapped / conflict / failed / unavailable counts.
- **Demo orders** are imported with `isDemo: true` and their original history (plus an *imported* audit entry). Side effects are suppressed through server-side `req.context` (not reachable from any API), demo orders never get email jobs, the scheduler and email processor skip them, and services refuse to change them.
- **Media**: placeholders are rasterized to WebP with sharp and uploaded to Supabase Storage at `brand/category/product/[hex]/elolnezet.webp`. Without storage configuration every image is reported as *unavailable* and products are imported without images; a later run with storage uploads and attaches the missing images (never replacing existing ones).

Before any work it checks that the media table matches the schema; shared infrastructure errors (PostgreSQL schema/connection/auth classes, S3 credential or bucket errors) stop the import once with the full sanitized cause (PostgreSQL code, message, detail, table/column; SQL text, parameters and connection strings omitted) instead of failing every record. Individual asset errors are reported separately. Outcomes per entity: created, repaired, skipped, mapped, conflict, failed, unavailable. Exit codes: 0 success, 1 partial success (some records failed), 2 refused (target database not named / production not confirmed), 3 aborted (shared error).

**Repair runs**: products that already exist get missing image relations restored (seed images not yet linked are added; variants without images are filled); existing relations are never removed or replaced. Media are reused by object key, so a rerun never uploads or creates duplicates. Uploads pass the prefix explicitly so Payload keeps the agreed key instead of renaming `elolnezet.webp`.

Verified against the configured Supabase development database (2026-11-13): after the schema fix, one image was imported and checked (record, storage object `image/webp`, public URL HTTP 200); the repair run created 76 media (1 reused) and repaired all 30 products with no failures; a further run skipped everything (77 media, 30 products) with no new uploads. The bucket holds 77 originals plus generated sizes (231 objects), every media object key equals prefix/filename, no email jobs or proposals were created, and the 2 demo orders were untouched.

## Supabase Storage

1. Create a **public** bucket (e.g. `termekkepek`) in Supabase → Storage.
2. Enable the S3 connection and create an access key pair (Storage → S3 configuration / S3 access keys). These keys bypass RLS for all buckets: keep them server-side only.
3. Set the six `SUPABASE_*` variables. The endpoint is `https://<project-ref>.storage.supabase.co/storage/v1/s3`; region as shown there.

`next.config.ts` derives `images.remotePatterns` from `SUPABASE_URL` and `SUPABASE_STORAGE_BUCKET`: HTTPS only, that host only, path `/storage/v1/object/public/<bucket>/**` (other hosts and buckets are rejected by the image optimizer). `SUPABASE_URL` must therefore be an `https://` URL; restart the dev server after changing these values. Without storage configuration no remote image host is allowed.

The Media collection stores the explicit object key (`brand/category/product/[color]/filename`) and uploads under that per-document prefix. New admin uploads go through `POST /api/media/product-upload`, which derives the key on the server; direct `POST /api/media` is refused. Public image URLs point straight to `SUPABASE_URL/storage/v1/object/public/<bucket>/<key>`. Referenced media cannot be deleted.

## Vercel

1. Import the repository; framework Next.js; build command `npm run build`.
2. Set all variables per environment (*Settings → Environment Variables*; mark secrets *Sensitive*). Production: `APP_ENV=production`, `EMAIL_MODE=resend`. Preview: `APP_ENV=preview`, a separate preview database, `EMAIL_MODE=log`.
3. Run `npm run migrate` against the target database before promoting a deployment that needs it.
4. **Scheduler**: Vercel cron is not used (there is no `vercel.json`); set up GitHub Actions as described in [Scheduler (GitHub Actions)](#scheduler-github-actions). `CRON_SECRET` changes in Vercel apply on the next deployment.
5. **Resend webhook**: in Resend → Webhooks add `https://<domain>/webhooks/resend` for the `email.*` events (at least delivered, bounced, failed, suppressed) and set `RESEND_WEBHOOK_SECRET`.
6. Sign in at `/admin` and create the first admin user (first registration), then add further admins in *Felhasználók*.

## Scheduler (GitHub Actions)

GitHub Actions is the only scheduler. `.github/workflows/process-cron.yml` calls `GET /cron/process` on the production site every 5 minutes (`*/5 * * * *`) and on manual runs.

**Configuration** (repository → *Settings → Secrets and variables → Actions*):

| Name | Tab | Value |
| --- | --- | --- |
| `APP_URL` | *Variables* | production origin, `https://` only, e.g. `https://shop.example.hu` (no path; a trailing slash is ignored) |
| `CRON_SECRET` | *Secrets* | exactly the same value as the production `CRON_SECRET` environment variable in Vercel |

When the secret is rotated, update both places; until both match, runs fail with HTTP 401.

**Behavior**:

- The request is `GET` over HTTPS with `Authorization: Bearer <CRON_SECRET>`. The header is passed to curl on stdin, the secret is never printed, and curl runs without verbose output.
- The run fails on a missing `APP_URL` or `CRON_SECRET`, a non-HTTPS `APP_URL` or any HTTP error. Timeouts: 10 s to connect, 90 s per request, 5 minutes per job.
- The workflow token has no permissions (`permissions: {}`). The concurrency group `process-cron` never starts a second run while one is active and never cancels an active run.
- Server-side protection does not depend on the workflow: the endpoint checks the secret, every step is idempotent, and emails and proposals are claimed with row locks, so overlapping calls are harmless.

**Timing**: GitHub runs scheduled workflows only from the default branch (the file must be merged there) and may delay or skip them under load, so five minutes is a target, not an exact execution guarantee. Order and proposal deadlines are evaluated against persisted timestamps whenever processing runs, so a late run changes only when due work is noticed, never the outcome (see [ordering-and-price-changes.md](ordering-and-price-changes.md#scheduler)). GitHub also disables schedules in repositories without activity for 60 days; re-enable the workflow on the *Actions* tab.

**Manual run and results**: *Actions → Process cron → Run workflow* (on the default branch). Every run is listed on the same page; open a run and its *Call /cron/process* step to see the JSON report (`emails`, `proposals`, `media`) or the error. With the GitHub CLI: `gh workflow run process-cron.yml`, then `gh run list --workflow process-cron.yml` and `gh run view <run-id> --log`.

## Verification status

Done locally (development and test databases on a local PostgreSQL 18 instance, Resend SDK mocked):

- migrations applied to an empty database; initial import run twice (idempotent, no emails, no jobs);
- 76 integration tests on real PostgreSQL (`npm test`): persistence and authorization, audit integrity, initial import idempotency and id mapping, side-effect suppression and demo exclusion, CSV import idempotency and persisted jobs, per-status switches, email retries/backoff and signed webhooks (duplicates, out-of-order), proposal timing and concurrent decisions, development-route restrictions;
- production build with `APP_ENV=production`; production server smoke test: storefront pages render from the database, `/fejlesztes` (and aliases, POSTs) 404, `/cron/process` 401 without/with a wrong secret and 200 with it, `/webhooks/resend` 401 unsigned, anonymous `/api/*` 403, admin views render for a signed-in admin;
- no secrets or connection strings in browser bundles or server logs.

**Blocked by missing credentials or infrastructure (not verified):**

- connecting to a real Supabase project (pooler/direct URLs, SSL, IPv4/IPv6), running migrations and the import there;
- uploading media to Supabase Storage (no bucket or S3 keys available; all 77 images reported as unavailable);
- sending real email through Resend and receiving real Resend webhooks (SDK mocked; webhook signatures produced in tests with the Svix scheme);
- the GitHub Actions scheduler against a deployed project (the workflow was only validated statically);
- interactive use of the admin UI in a browser (only server responses were checked).

## Production checklist

- [ ] Supabase project, pooler/direct URLs, public bucket, S3 keys
- [ ] All variables set per environment; `APP_ENV` correct everywhere
- [ ] `npm run migrate` against production before the first deploy
- [ ] Initial catalog import with `confirm-production` (demo orders are skipped automatically), or manual catalog entry
- [ ] First admin user; `ALLOW_INDEXING=true` only when going live
- [ ] Resend domain verified; `EMAIL_MODE=resend`; webhook configured
- [ ] GitHub Actions: `APP_URL` variable and `CRON_SECRET` secret set, workflow on the default branch, one manual run succeeded
- [ ] Legal texts, delivery fees and store settings reviewed in the admin
