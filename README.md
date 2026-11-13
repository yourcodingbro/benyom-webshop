# Benyom Webshop – Hungarian preorder webshop

A Hungarian preorder webshop built with Next.js (App Router), TypeScript, Payload CMS 3 on Supabase PostgreSQL, Supabase Storage, Resend, Tailwind CSS, shadcn/ui and framer-motion.

Customers pick products and variants, fill a cart and submit a **preorder**. Payment happens in person on collection or delivery. There is no online payment, no automatic invoicing and no stock tracking. Operations (orders, audit history, price-change proposals, products, CSV import, email history and notification switches) live in Payload's native admin at `/admin`.

All data is persistent: the app reads and writes only through Payload's Local API (`src/dto/`) on PostgreSQL. **A database is required, locally too.** There is no sample mode and no in-memory fallback; a failing database operation is an error, never a silent substitute.

## Requirements

- **Node.js 22.12 or newer** (developed on 22.16). Payload is pinned to 3.91.0 (3.92+ needs Node ≥ 22.23.4).
- **npm** (`package-lock.json`).
- **PostgreSQL**: a Supabase project (recommended, same as production) or any local PostgreSQL 15+ for development.
- Optional for full functionality: Supabase Storage (product images), Resend (real email).

## Local startup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create the local env file (git-ignored) and fill it in. See [.env.example](.env.example) for every variable:
   ```bash
   cp .env.example .env.local
   ```
   Minimum: `APP_ENV=development`, `DATABASE_URL` (and preferably `DATABASE_MIGRATION_URL`), `PAYLOAD_SECRET`, `APP_SIGNING_SECRET` (32+ random characters each, e.g. `openssl rand -hex 32`). Keep `EMAIL_MODE=log` while developing.
3. Apply the database migrations (uses `DATABASE_MIGRATION_URL`):
   ```bash
   npm run migrate
   ```
4. Import the initial data into **your development database**. The database name must be given explicitly (it is printed if missing):
   ```bash
   npm run import:initial -- target-database=postgres
   ```
5. Start the development server and create the first admin at <http://localhost:3000/admin>:
   ```bash
   npm run dev
   ```

The npm scripts load `.env.local` (Next.js and the Payload CLI both read it).

### Checks

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript, explicit return types) |
| `npm test` | Vitest integration tests on a real PostgreSQL database (`TEST_DATABASE_URL`, name must end in `_test`; its schema is dropped and re-created) |
| `npm run build` | Production build (no database access at build time) |
| `npm run migrate` / `migrate:status` / `migrate:create` | Payload migrations (version-controlled in `src/migrations/`) |
| `npm run import:initial` | Idempotent initial data import (see below) |
| `npm run generate:types` / `generate:importmap` | Regenerate `src/payload-types.ts` / the admin import map after schema or admin component changes |

## Environment and `APP_ENV`

`APP_ENV` is required: `development`, `test`, `preview` or `production`. It is validated with the rest of the configuration in [src/config/env.ts](src/config/env.ts); missing or invalid values stop the app with a message that names the variable (never its value). Secrets are server-only; a `NEXT_PUBLIC_` copy of any of them is rejected.

Development tools (`/fejlesztes`, its server action) exist only when `APP_ENV` is valid and not `production`, and require a signed-in admin. Production, a missing or an invalid `APP_ENV` all answer 404 (also for `/fejlesztés` and encoded spellings, enforced in `src/proxy.ts` and again in the page and action).

## Initial data import

`npm run import:initial -- target-database=<name> [skip-demo] [skip-media] [confirm-production]` moves the original dataset (`src/seed/initial-data.ts`, kept only as migration input) into the database through Payload:

- settings, brands, categories, 30 products with 167 variants (stable ids, SKUs and HEX colors preserved);
- product images rendered from the placeholders and uploaded to Supabase Storage under `brand/category/product/[color]/` (reported as *unavailable* when storage is not configured; a later run fills in missing images);
- two fictional orders as **historical demo data** (`isDemo`, marked *DEMÓ* in the admin): no emails, no jobs, never processed by the scheduler. Never imported when `APP_ENV=production`.

It is repeatable: existing records are skipped (never overwritten or deleted), records with the same slug under another id are mapped, and the report lists created / skipped / mapped / conflict / failed / unavailable counts. Details: [docs/deployment.md](docs/deployment.md#initial-data-import).

## Operations in the admin

| Workflow | Where |
| --- | --- |
| Orders: search, filter, details, status change, cancellation (reason required) | *Rendelések* |
| Audit history (append-only, chronological, actor and reason) | order → *Előzmények*; *Rendelési napló* |
| Price-change proposals: edit prices → review → send | order → *Árváltozási ajánlat* |
| Manual product management (drafts, variants, HEX, media) | *Termékek*, *Médiatár* |
| CSV import with template, dry run, persisted jobs | *Termékimport (CSV)* (`/admin/termekimport`), *Termékimportok* |
| Per-status customer email switches | *Értesítési beállítások* |
| Email history, content snapshot, delivery state, retry | *E-mail előzmények* |

Details: [docs/admin-operations.md](docs/admin-operations.md).

## Email

React Email templates, sent only through `emailService.sendEmail()` and persisted jobs:

- `EMAIL_MODE=log` (default): rendered and stored in the email history as *Naplózva*, nothing is sent and **no customer deadline starts**.
- `EMAIL_MODE=resend`: sent through Resend with a stable idempotency key per logical email. Failures are retried with backoff by the scheduler; provider acceptance is shown as *Átadva*, not delivered. Delivery and bounces arrive through the verified Resend webhook (`/webhooks/resend`).

Details: [docs/email.md](docs/email.md).

## Scheduler

`/cron/process` (Vercel cron, every minute, `Authorization: Bearer CRON_SECRET`) processes due email jobs, proposal reminders and expiry. It is idempotent; in development use *Ütemező futtatása* on `/fejlesztes`. See [docs/ordering-and-price-changes.md](docs/ordering-and-price-changes.md#scheduler).

## Information pages

General settings pages live at `/info/<slug>`, the FAQ at `/gyik` (content in `FaqAccordion`) and payment & delivery at `/fizetes-es-szallitas`. Old `/oldal/…` URLs redirect permanently in one step.

## Common problems

| Problem | Fix |
| --- | --- |
| "Hibás vagy hiányzó környezeti beállítás" on start | Fill in the listed variables in `.env.local` (names only are shown). |
| "Az áruház beállításai hiányoznak az adatbázisból" | Run the migrations and `npm run import:initial`, or fill in *Áruház beállításai* in the admin. |
| `relation … does not exist` | Run `npm run migrate`. |
| `/fejlesztes` returns 404 | Expected unless `APP_ENV` is `development`, `test` or `preview`; sign in at `/admin` first. |
| Image upload refused (503) | Configure the `SUPABASE_*` storage variables. |
| Proposal created but no deadline | `EMAIL_MODE=log` never starts deadlines; use `resend` with a verified sender. |
| `npm test` fails at setup | Set `TEST_DATABASE_URL` to a disposable database ending in `_test`. |

## Documentation

- [Architecture](docs/architecture.md) – layers, data flow, security boundaries
- [Project structure](docs/project-structure.md)
- [Data access](docs/data-access.md) – DTO functions on the Payload Local API, transactions, atomic contracts
- [Admin operations](docs/admin-operations.md) – orders, audit, proposals, products, CSV, notifications, email history
- [Catalog and variants](docs/catalog-and-variants.md)
- [Ordering and price changes](docs/ordering-and-price-changes.md) – snapshots, proposals, deadlines, scheduler
- [Email](docs/email.md) – Resend, logging mode, jobs, retries, webhooks, history
- [CSV import](docs/csv-import.md)
- [Deployment](docs/deployment.md) – Supabase, migrations, storage, Vercel, cron, verification status
