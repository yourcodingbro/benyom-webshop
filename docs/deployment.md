# Deployment (future work)

Nothing in this document is active yet. The application is not deployed and has no production configuration.

## Versions

| Package | Pinned | Why |
| --- | --- | --- |
| next | 16.4.6 | Payload 3.91 peer range `>=16.3.3 <17` |
| payload, @payloadcms/* | 3.91.0 | 3.92+ requires Node `^22.23.4 \|\| >=24.22.1`; the dev machine has 22.16 |
| react | 19.3.1 | |
| typescript | 5.9.3 | TypeScript 7 (native) not yet assumed compatible with Next/Payload tooling |
| tailwindcss | 4.3.5 | shadcn v4 CLI, `tw-animate-css` |
| framer-motion | 14.12.0 | |
| zod | 4.6.7 | |

Before going live: use Node 24 LTS, then upgrade all `@payloadcms/*` packages together to the latest 3.x. `npm audit` shows a moderate `deepmerge` advisory inside `payload` (no fix available) and a dev-only `esbuild` advisory via `drizzle-kit`. `dompurify` and `undici` are pinned to patched versions through `overrides`.

## Payload + Supabase PostgreSQL

1. Create a Supabase project. Use the **pooled** connection string (Supavisor, transaction mode, port 6543) for Vercel serverless, and the direct connection for migrations.
2. Set `DATABASE_URL` and `PAYLOAD_SECRET` (long random). Once both are set, `src/proxy.ts` stops intercepting `/admin` and `/api`.
3. `push: false` is configured. Create and run migrations:
   ```bash
   npm run payload -- migrate:create initial
   ```
   ```bash
   npm run payload -- migrate
   ```
   Migrations live in `src/migrations/`. Run `migrate` in the deploy pipeline before switching traffic.
4. Create the first admin user (role `admin`).
5. Replace the DTO internals with Payload Local API calls ([data-access.md](data-access.md)). Map `StoreSettings` global fields (`deliveryMethods[].feeKind/feeAmount`, `pages[].body` paragraphs) to the `StoreSettings` type. Keep `getOrder` returning `null` for forbidden access.
6. Turn off sample-only code paths: the sample checkout guard, dev tools, preview storage, and the `isSample` flag on orders.
7. Generate types after schema changes: `npm run generate:types`.

**Ecommerce plugin evaluation:** `@payloadcms/plugin-ecommerce` (beta) adds products/variants/carts/orders/transactions and models orders as the result of a successful payment transaction (Stripe adapter), with inventory decrementing enabled by default. That conflicts with payment-free preorders, HUF-only pricing and no inventory tracking, so it is **not used**. The custom collections here cover the required model without fake payments.

## Supabase Storage

- Use `@payloadcms/storage-s3` with Supabase's S3-compatible endpoint (not installed yet). Credentials are server-only env vars.
- Object keys come from `buildMediaObjectKey()`: `brand/category/product/[color]/filename-<suffix>.ext`, e.g. `apple/mobiltelefon/iphone-17/000000/elolnezet-a1b2c3.webp`. Normalized slugs, lowercase HEX without `#`, an allowlisted extension, and a random suffix against collisions.
- Store the key on the media record (`objectKey`). Never infer relations from paths. Renaming a product does not move files, so URLs stay valid. Variants reference media by id, so images can be shared.
- Add a storage-capacity segment only when images actually differ by capacity.
- Bucket policy: public **read** for product images only. Writes and deletes go only through Payload (admin access) with the service key. Media referenced by products cannot be deleted (`Media` hook).
- Vercel: request bodies are limited, so use the adapter's client uploads (presigned/direct upload) for large images. Validate MIME type and size.
- Configure `next.config.ts` `images.remotePatterns` for the Supabase public URL.

## Vercel

- Env: `APP_ENV=production` (or rely on `VERCEL_ENV`), `APP_SIGNING_SECRET`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `PAYLOAD_SECRET`, storage keys, `RESEND_API_KEY`, `EMAIL_FROM`, and `ALLOW_INDEXING=true` only for the real store.
- Preview deployments keep `noindex` (the default).
- Hosting access logs record request paths. Decision tokens are in the path, so restrict log access and retention, or move the token to the URL fragment and POST it from the page (see remaining requirements).

## Scheduler

Proposal reminders and expiry need a durable, authenticated job:
- An authenticated route (e.g. `POST /api/jobs/proposals`, `Authorization: Bearer <CRON_SECRET>`) calling `priceChangeService.processDueProposals(SYSTEM)`.
- Vercel Cron frequency depends on the plan. Hobby allows only daily schedules (with up to an hour of jitter), which is **not enough**. Use Pro (per-minute crons) or an external scheduler / Supabase `pg_cron` + `pg_net` calling the route, or Payload Jobs Queue (`jobs.autoRun`) on a long-running host.
- Recommended frequency: every 5 minutes. Timing tolerance is then ≤ 5 min after a deadline. The customer never loses time, because periods start at successful send times and expiry happens only after the full 24 h.
- Idempotent and concurrency-safe: email claims prevent duplicate reminders, `resolveProposal` is compare-and-set, and accepted/rejected proposals are never cancelled. Stale claims (> 10 min) are retried after crashes. Persist notifications in an outbox.

## Remaining production requirements

1. Real admin authentication (Payload users) replacing the dev panel. Admin UI actions for proposals must call `priceChangeService` (e.g. a custom endpoint or button), not raw collection edits.
2. Payload-backed DTO implementations with transactions for the atomic contracts.
3. Durable outbox + Resend + bounce webhooks ([email.md](email.md)).
4. Authenticated scheduler on a plan that supports it.
5. Storage adapter, real images and bucket policy.
6. Real legal texts (ÁSZF, privacy notice), real contact data and confirmed delivery fees. Methods with `unknown` fees stay unorderable.
7. `APP_SIGNING_SECRET`, rate limiting on checkout and decision endpoints, monitoring and alerting.
8. Consider moving decision tokens out of URL paths (fragment + POST) to keep them out of hosting logs.
9. Node/Payload upgrade as described above.
