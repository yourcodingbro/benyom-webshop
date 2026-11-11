# Data access (`src/dto/`)

The folder name `dto` is intentional. Each file is one business entity and exports named async functions with explicit inputs and outputs. Callers (pages, services, server actions) never know where data lives.

| File | Functions |
| --- | --- |
| `products.ts` | `getProducts(query)`, `getProductBySlug(slug)`, `getProductById(id, auth)`, `getAllProducts(auth)`, `getVariantsBySku(skus)`, `getProductSitemapEntries()`, `addProduct(input, auth)`, `updateProduct(id, input, auth)`, `deleteProduct(id, auth)` |
| `brands.ts` | `getBrands()`, `getPopularBrands(limit)`, `getBrandBySlug(slug)`, `addBrand(input, auth)` |
| `categories.ts` | `getCategories({ brandSlug? })`, `getPopularCategories(limit)`, `getCategoryBySlug(slug)`, `addCategory(input, auth)` |
| `orders.ts` | `addOrder(input)` (idempotent), `getOrder(reference, auth)`, `getOrders(query, auth)`, `updateOrder(reference, expectedVersion, patch, auth)` |
| `price-change-proposals.ts` | `addProposal(input, auth)`, `getProposal`, `getProposalsForOrder`, `getActiveProposal`, `getPendingProposals`, `getProposalByTokenHash(hash)`, `claimProposalEmail`, `completeProposalEmail`, `resolveProposal(input, auth)` |
| `settings.ts` | `getStoreSettings()`, `getInfoPage(slug)` |
| `email-log.ts` | `addEmailLogEntry`, `getEmailLogEntries(auth)`, `getEmailLogEntry(id, auth)` |
| `sample-store.ts` | private: `sampleStore()`, `resetSampleStore()`, `copy()` |

## Consistent conventions

- **Identifiers**: string ids. Products also have stable slugs, and variants have globally unique SKUs.
- **Money**: integer forints (`HufAmount`). All arithmetic goes through `lib/money.ts` (safe-integer checks).
- **Dates**: UTC ISO strings. Formatting to Europe/Budapest happens only in the UI and emails (`lib/format.ts`).
- **Pagination**: `Paginated<T> = { items, page, pageSize, totalItems, totalPages }`.
- **Errors**: `AppError` with code `NOT_FOUND | VALIDATION | CONFLICT | FORBIDDEN | UNAVAILABLE | INVALID_STATE` and a Hungarian message.
- **Authorization**: protected functions take an `AuthorizationContext` and call `assertAdminOrSystem`. `getOrder` hides unauthorized results as `null`.
- **Copies**: results are `structuredClone`s, so callers cannot mutate storage by reference.

## Atomic operation contracts

| Contract | Guarantees | Future Payload/Postgres implementation |
| --- | --- | --- |
| `addOrder` | Same idempotency key + same submission hash → existing order; different hash → `CONFLICT` | Unique index on `idempotencyKey`, insert-or-select in one transaction |
| `updateOrder(ref, expectedVersion, …)` | Compare-and-set on `version`; `null` = append-only | `UPDATE … WHERE version = $n`, or a transaction with row lock |
| `addProposal` | Supersedes the active proposal only if its id is passed explicitly, inserts the new one and holds the order, all at once | Single transaction (`req.transactionID`) |
| `claimProposalEmail` | Only one sender per email; a stale claim (10 min) may be retaken | `UPDATE … SET claimedAt WHERE sentAt IS NULL AND (claimedAt IS NULL OR claimedAt < stale)` |
| `resolveProposal` | Exactly one terminal transition wins (accept / reject / expire / withdraw); the order patch applies only for the winner | `UPDATE proposals SET status=… WHERE id=… AND status='pending' RETURNING` + order update in the same transaction |

In the sample store, atomicity comes from doing the check and the write synchronously, with no `await` in between, inside one Node.js process.

## Replacing internals with Payload (future)

Only the function bodies change. Signatures and return types stay the same. Example:

```ts
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug }, _status: { equals: 'published' } },
    depth: 2,
    limit: 1,
    overrideAccess: false, // public read rules apply
  })
  return result.docs[0] ? toProduct(result.docs[0]) : null // normalize Payload docs here
}
```

Rules for the Payload implementation:
- Keep the `toXxx()` normalizers inside `src/dto/`. Payload-specific shapes (relationship objects, `_status`, array row ids, `null` vs `undefined`) never leave this folder.
- Admin-scoped calls pass `user` and `overrideAccess: false`. System jobs use `overrideAccess: true` explicitly, only in DTO functions that received a `system` context.
- Multi-document contracts use one transaction (`payload.db.beginTransaction()` / `req`).
- Do **not** add a separate Supabase database client. The flow stays Application → DTO → Payload → PostgreSQL.
- Server-only modules start with `import 'server-only'`. Browser-safe types live in `src/types/`.
