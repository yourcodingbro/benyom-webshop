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
Payload Local API (src/dto/payload.ts) → @payloadcms/db-postgres → Supabase PostgreSQL
   collection hooks (src/collections/hooks/): audit trail, per-status email policy, edit rules
```

- **Pages** are server components. They read through DTO functions or services. Client components (`'use client'`) are kept small: Reveal, cart provider/drawer, product card (compact preview with quick add), variant configurator and options, checkout form, mobile nav, CSV form. Variant-selection rules live once in `src/lib/variant-selection.ts` and are used through `useVariantSelection` by both the product page and the product card.
- **Client components never import `src/dto` or `src/services`.** They call server actions (`quoteCartAction`, `placeOrderAction`, dev actions). An architecture test enforces this.
- **Services** are plain objects (`orderService.placeOrder(input)`) with an explicit contract type. They contain no persistence code.
- **DTO functions** are the only code that touches stored data (an architecture test enforces it). They map Payload documents to application types, run multi-step changes in transactions, and check the `AuthorizationContext`.
- **Payload admin** custom views/components (`src/components/admin/`) only collect input and call admin endpoints (`src/collections/endpoints.ts`), which delegate to services.

## Main entry points

| Concern | Entry point |
| --- | --- |
| Cart pricing | `quoteService.quoteCart(lines)` |
| Checkout | `orderService.placeOrder(input: unknown)` |
| Fulfillment | `orderService.updateFulfillmentStatus`, `orderService.cancelOrder` |
| Price changes | `priceChangeService.createProposal`, `.getDecisionView`, `.decide`, `.processDueProposals` |
| Email | `emailService.sendEmail(input)`, persisted jobs, `processDue`, `retry`, `handleWebhook` |
| Scheduler | `schedulerService.runOnce()` via `/cron/process` |
| CSV | `importService.createJob`, `importService.runJob` (admin), `previewImport`/`applyImport` |
| Navigation | `catalogService.getNavigation()` (mobile menu, /markak). The desktop header has fixed links: Összes termék, Kapcsolat (Fizetés és szállítás is in the footer) |
| Contact form | `contactService.submitContactMessage(input)` → `addContactMessage` (idempotent) → `emailService.sendEmail` |
| Dev tools | `/fejlesztes` (non-production only): manual scheduler run |

## Data flow example: checkout

1. Product page → `CartProvider.addItem` → `quoteCartAction` → `quoteService.quoteCart` → `getVariantsBySku` (DTO). The browser stores `{ sku, quantity, quoteToken }` in localStorage.
2. Checkout form → `placeOrderAction(payload)` → `orderService.placeOrder`:
   validate (zod) → load settings (DTO) → re-quote on the server → build snapshot → `addOrder` (DTO, idempotent) → `notificationService.notify` ×2.
3. The action sets an httpOnly cookie (`benyom_rendeles`, path `/rendeles`) with `reference.hmac`. The confirmation page reads it. No order data goes into a URL.

## Security boundaries

- **Authorization context** is passed to every protected DTO call: `admin`, `system`, `order-access` (signed token), or `anonymous`. `getOrder` returns `null` for both "missing" and "forbidden", so references cannot be probed. References are random (`BNY-XXXX-XXXX`, no sequence).
- **Admin identity** comes only from Payload's authenticated session (`req.user` with the `admin` role). Audit actors are derived server-side.
- **Payload access control**: orders, proposals, audit entries, emails, webhook events, contact messages and import jobs are admin-read-only; audit entries, emails, proposals and jobs cannot be created, changed or deleted through any API. Token hashes are unreadable through any API. Server workflows use the Local API with `overrideAccess: true` only after their own checks; public catalog reads use `overrideAccess: false`.
- **Development tools** exist only when `APP_ENV` is valid and not `production` (proxy 404 for every alias, plus page and server-action checks) and require an admin session.
- **Secrets**: all from validated server-side env (`src/config/env.ts`); none may use `NEXT_PUBLIC_`. Quotes, order-access cookies and decision tokens are HMAC-signed with `APP_SIGNING_SECRET`; only SHA-256 hashes of decision tokens are stored. Cron and webhook endpoints verify `CRON_SECRET` and Svix signatures.
- **Headers**: `nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`; `no-referrer` on decision pages. The dev request log ignores `/arvaltozas/` paths.
- **Indexing**: `robots.txt` disallows everything and pages carry `noindex` unless `APP_ENV=production` **and** `ALLOW_INDEXING=true`.

## Reference sites (inspected 2026-11-11)

- **benyom.hu** (visual reference): read the page and `css/style.css` directly. The tokens below come from that stylesheet. Montserrat headings, Open Sans body, `#ff0000` accent, black/near-black header (`#000`, `#111`), white surfaces, `#666` body text, `#ddd`/`#f2f2f2` neutrals, pill buttons (50px radius), and a text logo with a red left bar. Interactive red was darkened to `#e00000` for WCAG AA contrast.
- **partnerogsm.hu**: brand-first menu, breadcrumbs, product pages with grouped spec lists, and a "coming soon" status with an expected date. Listing filters and checkout steps could **not** be observed (dynamic grid; the cart route showed no cart).
- **gsmgo.hu**: category → brand tiles, a sort control (name/price), spec key/value groups, and colors as separate products. Checkout was **not** reached (empty cart).

Only patterns were adopted. No copy, business details or photos were reused.

## Known limitations

See [deployment.md](deployment.md#verification-status) for what could not be verified without real Supabase, Resend and Vercel credentials.
