# Data access (`src/dto/`)

Each file is one business entity and exports named async functions with explicit inputs and outputs. Callers (pages, services, server actions, admin endpoints) never see Payload documents: every function maps them to the application-owned types in `src/types/`. The function signatures are the same as before the database migration; only their internals changed.

All data goes through **Payload's Local API on Supabase PostgreSQL** (`src/dto/payload.ts`). There is no other database client, no sample store and no fallback: a failed query throws.

| File | Functions |
| --- | --- |
| `payload.ts` (private) | `payloadClient()`, `withTransaction(work)`, `orderWriteContext(events, options)`, `relationId`, `isUniqueViolation` |
| `products.ts` | `getProducts(query)`, `getProductFacets(query)`, `getProductBySlug(slug)`, `getProductById(id, auth)`, `getAllProducts(auth)`, `getVariantsBySku(skus)`, `getProductSitemapEntries()`, `addProduct(input, auth)`, `updateProduct(id, input, auth)`, `deleteProduct(id, auth)` |
| `brands.ts`, `categories.ts` | `getBrands()`, `getPopularBrands(limit)`, `getBrandBySlug(slug)`, `addBrand(input, auth)`; `getCategories({ brandSlug? })`, `getPopularCategories(limit)`, `getCategoryBySlug(slug)`, `addCategory(input, auth)` |
| `orders.ts` | `addOrder(input, inTransaction?)` (idempotent), `getOrder(reference, auth)`, `getOrderById(id, auth)`, `getOrders(query, auth)`, `updateOrder(reference, expectedVersion, patch, auth, inTransaction?)`, `patchOrderInTransaction` (DTO-internal) |
| `price-change-proposals.ts` | `addProposal`, `getProposal`, `getProposalsForOrder`, `getActiveProposal`, `getPendingProposals` (never demo), `getProposalByTokenHash`, `resolveProposal`, `recordProposalEmailAttempt`, `anchorProposalEmail` |
| `email-log.ts` | `enqueueEmail`, `claimEmailJob`, `completeEmailJob`, `requeueEmailJob`, `getDueEmailJobIds`, `getEmailJob`, `applyProviderEvent`, `getEmailLogEntries(auth)`, `getEmailLogEntry(id, auth)` |
| `contact-messages.ts` | `addContactMessage(input)` (idempotent), `getContactMessage`, `updateContactMessageStatus`, `getContactMessages` |
| `import-jobs.ts` | `createImportJob`, `getImportJob`, `claimImportJob`, `recordImportGroup`, `finishImportJob` |
| `settings.ts` | `getStoreSettings()`, `getInfoPage(slug)` |
| `auth.ts` | `getAdminAuthorization(headers)` (Payload session → admin context) |

## Conventions

- **Identifiers**: catalog records (brands, categories, products) and proposals use stable text ids (`brand-apple`, `prod-iphone-17`, `prop-…`); the CSV import and the initial import rely on them. Orders, audit entries, emails and jobs use numeric Payload ids plus their own business keys (order `reference`, email `idempotencyKey`).
- **Money**: integer forints; arithmetic in `lib/money.ts`.
- **Dates**: UTC ISO strings, read from `lib/clock.ts` (tests control it).
- **Errors**: `AppError` (`NOT_FOUND | VALIDATION | CONFLICT | FORBIDDEN | UNAVAILABLE | INVALID_STATE`) with Hungarian messages. Payload validation errors (400/409) and unique-index violations are mapped to `VALIDATION`/`CONFLICT`.
- **Authorization**: protected functions take an `AuthorizationContext` and call `assertAdminOrSystem`. `getOrder` returns `null` for both "missing" and "forbidden". Public catalog reads use `overrideAccess: false` (drafts are never returned); server-side workflows use `overrideAccess: true` after their own checks.
- **Drafts**: products use Payload drafts; `_status` maps to `Product.status`.

## Transactions and atomic contracts

`withTransaction(work)` opens a Payload transaction and passes its `req` to every call. Collection hooks run inside it, so a change commits together with its audit entries and queued emails, or not at all. Row locks (`SELECT … FOR UPDATE` through Payload's adapter session) serialize competing writers.

| Contract | Guarantee | Implementation |
| --- | --- | --- |
| `addOrder` | Same idempotency key + same hash → existing order; different hash → `CONFLICT`; concurrent duplicates create one order | unique index on `idempotencyKey`; the loser re-reads the winner |
| `updateOrder` / `patchOrderInTransaction` | compare-and-set on `version`; audit entries in the same transaction | row lock, version check, update with `orderWriteContext` |
| `addProposal` | one pending proposal per order; supersession only when explicitly requested; order put on hold | order row lock, pending check after the lock |
| `resolveProposal` | exactly one of accept / reject / expire / withdraw wins | proposal row lock + `status = pending` check; winner-only order patch and decision email |
| `claimEmailJob` / `completeEmailJob` | one delivery attempt at a time per email; stale claims recoverable; demo jobs cancelled | row lock + state check |
| `applyProviderEvent` | duplicate webhooks are no-ops; no backwards state change | unique `eventId`, status ranking |
| `claimImportJob` / `recordImportGroup` | one batch per job; progress saved per product group | row lock + heartbeat |

## Request context (`req.context`)

Service-driven order writes pass a full `OrderWriteContext` (`workflow`, `auditEvents`, `skipStatusNotification`, `suppressSideEffects`) built by `orderWriteContext()`. Payload merges context into a shared request, so every write sets all flags explicitly. `req.context` cannot be set by REST or GraphQL clients; admin edits through the API never carry these flags and go through full validation in `protectOrder`.
