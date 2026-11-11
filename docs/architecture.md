# Architecture

## Layers

```
Browser (server components + small client islands)
   │  server actions (src/app/**/actions.ts) · route handlers
   ▼
Services  (src/services/*Service.ts)      business rules & workflows
   │
   ▼
DTO functions (src/dto/*.ts)               data access, authorization context, atomic contracts
   │
   ▼
Sample runtime store (src/dto/sample-store.ts)  ← src/sample.ts (immutable seed)
   ⋯ future: Payload Local API → @payloadcms/db-postgres → Supabase PostgreSQL
```

- **Pages** are server components. They read through DTO functions or services. Client components (`'use client'`) are kept small: Reveal, cart provider/drawer, product card (compact preview with quick add), variant configurator and options, checkout form, mobile nav, CSV form. Variant-selection rules live once in `src/lib/variant-selection.ts` and are used through `useVariantSelection` by both the product page and the product card.
- **Client components never import `src/dto` or `src/services`.** They call server actions (`quoteCartAction`, `placeOrderAction`, dev actions). An architecture test enforces this.
- **Services** are plain objects (`orderService.placeOrder(input)`) with an explicit contract type. They contain no persistence code.
- **DTO functions** are the only code that touches stored data. They return copies, normalize types, and check the `AuthorizationContext`.

## Main entry points

| Concern | Entry point |
| --- | --- |
| Cart pricing | `quoteService.quoteCart(lines)` |
| Checkout | `orderService.placeOrder(input: unknown)` |
| Fulfillment | `orderService.updateFulfillmentStatus`, `orderService.cancelOrder` |
| Price changes | `priceChangeService.createProposal`, `.getDecisionView`, `.decide`, `.processDueProposals` |
| Email | `emailService.sendEmail(input)` (called only by `notificationService.notify`) |
| CSV | `importService.previewImport`, `importService.applyImport` |
| Navigation | `catalogService.getNavigation()` (mobile menu, /markak). The desktop header has fixed links: Összes termék, Fizetés és szállítás, Kapcsolat |
| Contact form | `contactService.submitContactMessage(input)` → `addContactMessage` (idempotent) → `emailService.sendEmail` |
| Dev controls | `simulationService.*` |

## Data flow example: checkout

1. Product page → `CartProvider.addItem` → `quoteCartAction` → `quoteService.quoteCart` → `getVariantsBySku` (DTO). The browser stores `{ sku, quantity, quoteToken }` in localStorage.
2. Checkout form → `placeOrderAction(payload)` → `orderService.placeOrder`:
   validate (zod) → load settings (DTO) → re-quote on the server → build snapshot → `addOrder` (DTO, idempotent) → `notificationService.notify` ×2.
3. The action sets an httpOnly cookie (`benyom_rendeles`, path `/rendeles`) with `reference.hmac`. The confirmation page reads it. No order data goes into a URL.

## Security boundaries

- **Authorization context** is passed to every protected DTO call: `admin`, `system`, `order-access` (signed token), or `anonymous`. `getOrder` returns `null` for both "missing" and "forbidden", so references cannot be probed. References are random (`BNY-XXXX-XXXX`, no sequence).
- **Dev admin**: `/fejlesztes` acts as a sample admin through `getDevAdminAuthorization()`. This is *not* authentication. It throws whenever dev tools are disabled, and they are always disabled when `APP_ENV`/`VERCEL_ENV` is `production`.
- **Payload routes** (`/admin`, `/api/*`) are answered by `src/proxy.ts` with an explicit 503 unless `DATABASE_URL` and `PAYLOAD_SECRET` are set. Payload is never initialized in sample mode.
- **Payload access control** is prepared: orders, proposals and users are admin-only for every operation. Token hashes are unreadable through any API (`access.read: () => false`). Payload's Local API defaults to `overrideAccess: true`. Future DTO code must pass `overrideAccess: false` plus `user` for user-scoped calls (see [data-access.md](data-access.md)).
- **Secrets**: quotes and order-access cookies are HMAC-signed with `APP_SIGNING_SECRET`. In production it is required (≥ 32 chars). In sample mode a random per-process secret is used. Decision tokens are random 256-bit values, and only their SHA-256 hashes are stored.
- **Headers**: `nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`; `no-referrer` on decision pages. The dev request log ignores `/arvaltozas/` paths.
- **Indexing**: `robots.txt` disallows everything and pages carry `noindex` unless `APP_ENV=production` **and** `ALLOW_INDEXING=true`.

## Reference sites (inspected 2026-11-11)

- **benyom.hu** (visual reference): read the page and `css/style.css` directly. The tokens below come from that stylesheet. Montserrat headings, Open Sans body, `#ff0000` accent, black/near-black header (`#000`, `#111`), white surfaces, `#666` body text, `#ddd`/`#f2f2f2` neutrals, pill buttons (50px radius), and a text logo with a red left bar. Interactive red was darkened to `#e00000` for WCAG AA contrast.
- **partnerogsm.hu**: brand-first menu, breadcrumbs, product pages with grouped spec lists, and a "coming soon" status with an expected date. Listing filters and checkout steps could **not** be observed (dynamic grid; the cart route showed no cart).
- **gsmgo.hu**: category → brand tiles, a sort control (name/price), spec key/value groups, and colors as separate products. Checkout was **not** reached (empty cart).

Only patterns were adopted. No copy, business details or photos were reused.

## Known limitations

See [sample-mode.md](sample-mode.md#limitations) and [deployment.md](deployment.md#remaining-production-requirements).
