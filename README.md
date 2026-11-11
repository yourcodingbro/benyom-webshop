# Benyom Webshop – Hungarian preorder webshop (sample mode)

A Hungarian preorder webshop built with Next.js (App Router), TypeScript, Payload CMS, Tailwind CSS, shadcn/ui and framer-motion.

> **Sample mode only.** The shop runs on immutable sample data plus an in-memory runtime store. There is no database, no file uploads, and no real email. Orders placed here are not real. Payload, Supabase, Vercel and Resend are prepared but **not connected**.

Customers pick products and variants, fill a cart, and submit a **preorder**. Payment happens in person on collection or delivery. There is no online payment, no automatic invoicing and no stock tracking.

## Requirements

- **Node.js 22.12 or newer** (developed on 22.16). Payload is pinned to 3.91.0 because Payload 3.92+ needs Node ≥ 22.23.4. Upgrading Node lets you upgrade Payload (see [docs/deployment.md](docs/deployment.md)).
- **npm** (the lockfile is `package-lock.json`).
- No external accounts or credentials.

## Local startup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional local configuration. Sample mode needs no variables. To set the site URL or a stable signing secret:
   ```bash
   cp .env.example .env.local
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open <http://localhost:3000>. The development tools are at <http://localhost:3000/fejlesztes>.

### Production build

```bash
npm run build
```
```bash
npm start
```

`npm start` runs with `NODE_ENV=production`, so the dev tools are off. To try them against a local production build, set `ENABLE_SAMPLE_DEV_TOOLS=true`. Setting `APP_ENV=production` (or `VERCEL_ENV=production`) always disables the dev tools **and** the sample checkout.

### Checks

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript, explicit return types) |
| `npm test` | Vitest: pricing, orders, price changes, CSV import, architecture rules |
| `npm run check` | All three above |
| `npm run generate:types` | Regenerates `src/payload-types.ts` (works without a database) |
| `npm run generate:importmap` | Regenerates the Payload admin import map |

## What to try

1. On the homepage, pick one of the top three brands or categories (ranked explicitly in the sample data), or open *Összes márka* / *Összes kategória*. Browse by brand (Apple, Samsung, Xiaomi, Google → phones, tablets, smartwatches, earbuds), search (`SAM-S26U`), and filter by color, storage and price. Every filter state is a shareable URL.
2. In any product card, choose color/storage and add to the cart directly: the card updates price, image and availability, and blocks incomplete or unavailable selections. On a product page, pick a color swatch and a storage size. The URL updates (`?valtozat=SKU`). Unavailable combinations are struck through and cannot be added.
3. Add to cart, then check out with a fictional name and `@example.com` email. Pick personal collection or delivery (2 990 Ft, a **fictional sample fee**). The parcel-locker method has an **unknown** fee, so it cannot be chosen.
4. In `/fejlesztes`: create a price-change proposal for your order, open the email preview, and use its decision link. Advance time (+24 h), run the scheduler, simulate email failures, or reset everything.

## Email logging and previews

Every notification goes through `emailService.sendEmail()` ([src/services/emailService.ts](src/services/emailService.ts)). Nothing is sent. Each attempt:
- renders the Hungarian template,
- logs `[EMAIL – SZIMULÁLT, NEM KÜLDÖTT]` with recipient, subject, template and references (never bodies, links or tokens),
- stores a rendered preview while dev tools are enabled (`/fejlesztes` → *E-mail napló*).

Details: [docs/email.md](docs/email.md).

## Time simulation and reset

- The *Idő* controls move a server-side simulated clock (+1/+12/+24 h). It affects quotes, proposal deadlines and the scheduler. The system clock is untouched.
- *Ütemező futtatása* runs one scheduler tick (proposal retries, reminders, timeout cancellation). There is no live cron.
- *Teljes visszaállítás* restores the initial sample data and resets the clock and failure simulation.
- All runtime state (orders, proposals, email log, imports, price changes) lives in server memory. It is lost when the dev server restarts or the code reloads with a full restart. It is never shared between instances. See [docs/sample-mode.md](docs/sample-mode.md).

## Common problems

| Problem | Fix |
| --- | --- |
| `/admin` shows "nem elérhető" (503) | Expected in sample mode: Payload needs `DATABASE_URL` and `PAYLOAD_SECRET`. |
| `/fejlesztes` returns 404 | Dev tools are off in production builds. Use `npm run dev`, or set `ENABLE_SAMPLE_DEV_TOOLS=true` with `npm start`. |
| Cart prices "reset" after restarting the server | Quotes are signed with a per-process secret unless `APP_SIGNING_SECRET` is set; old quotes then fall back to catalog prices. |
| Orders disappeared | Runtime state is in memory; a server restart clears it. |
| `npm install` warns about engines | Use Node 22.12+ (`nvm install 22`). |
| Port 3000 busy | `npx next dev -p 3001` and set `NEXT_PUBLIC_SITE_URL` accordingly. |

## Documentation

- [Architecture](docs/architecture.md) – layers, data flow, security boundaries
- [Project structure](docs/project-structure.md) – what lives where
- [Data access](docs/data-access.md) – DTO functions and how to swap them to Payload
- [Catalog and variants](docs/catalog-and-variants.md) – brands, categories, HEX colors, swatches
- [Ordering and price changes](docs/ordering-and-price-changes.md) – snapshots, quotes, proposals, deadlines, races
- [Email](docs/email.md) – logging implementation and future Resend integration
- [CSV import](docs/csv-import.md) – format, rules, idempotency
- [Sample mode](docs/sample-mode.md) – runtime store, dev tools, limitations
- [Deployment](docs/deployment.md) – Payload, Supabase, Storage, Vercel, scheduler (future work)
