# Sample mode

## Sample data vs runtime state

- `src/sample.ts` is the **immutable** initial dataset. Deep-frozen, server-only, imported only by `src/dto/sample-store.ts`. It contains 4 brands and 4 categories (each with an explicit `popularityRank` used by the homepage top three), 30 products (one draft, one discontinued, one temporarily unavailable, several unavailable variants), 167 variants with unique SKUs and HEX colors, settings with clearly fictional contact details and fees, info pages marked as sample text, and two fictional orders. One of them (`BNY-MNTA-0002`) is a price-review scenario.
- `src/dto/sample-store.ts` holds the **runtime store**, a deep clone of the sample data kept on `globalThis` in the Node.js process. Orders, proposals, email log, CSV imports and demo price changes mutate only this store. Source files are never written.

Scope and reset:
- One store per server process. A restart, redeploy, or another serverless instance means an empty or fresh store. In-memory state does **not** survive any of these, and multiple instances do not share it.
- `/fejlesztes` → *Teljes visszaállítás* restores the initial state, resets the clock and clears failure simulation.
- Editing `src/sample.ts` during development rebuilds the store automatically on the next request (content fingerprint check), discarding runtime changes.
- The browser cart lives in `localStorage` (`benyom-kosar-v1`): SKU, quantity and signed quote token only.

Sample persistence must not be used for real customer orders. The sample checkout is disabled when `APP_ENV=production` or `VERCEL_ENV=production`. A permanent banner says orders are not real.

## Development tools (`/fejlesztes`)

Available only when dev tools are enabled (`npm run dev`, or `ENABLE_SAMPLE_DEV_TOOLS=true` outside production). Otherwise the page returns 404 and every action throws.

- **Time**: +1/+12/+24 h, reset. A server-side offset clock (`lib/clock.ts`) used by all business rules.
- **Scheduler**: runs one `processDueProposals` tick (simulated authenticated cron).
- **Email failures**: success / next send fails / all sends fail.
- **Catalog price change**: change a variant price by ±% to demonstrate quotes and price review.
- **Orders**: status transitions, cancellation, creating and superseding proposals, history and notification records.
- **Email log**: subjects, statuses and preview links.
- **CSV import**: dry run / apply.

## Payload in sample mode

Collections and the global are configured, and types and the import map can be generated without a database. Without `DATABASE_URL` + `PAYLOAD_SECRET`, `/admin` returns an explicit Hungarian 503 page and `/api/*` returns a JSON 503 (`src/proxy.ts`). The following native admin features are therefore **unavailable**: login, collection lists and search, editing products/orders/settings, media upload, version history, REST/GraphQL APIs. Nothing imitates the Payload admin. The dev tools page is openly a development panel.

## Limitations

- In-memory, single-process, non-durable state. There is no real authentication: the dev panel acts as an unauthenticated sample admin in development only.
- No live scheduler. Reminders and expiry happen only when the scheduler is run manually (or via tests).
- Quotes and order-access cookies use a per-process secret unless `APP_SIGNING_SECRET` is set.
- Placeholder SVG images. Product specifications and prices are illustrative.
- Legal pages are placeholder text, not legal documents.
- Reduced-motion and no-JavaScript reveal behavior is implemented in code (`MotionConfig reducedMotion="user"`, `useReducedMotion`, a `<noscript>` override) but was not verified with an OS-level setting.
