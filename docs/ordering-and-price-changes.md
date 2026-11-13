# Ordering and price changes

## Business model

Preorder only: cart → contact/billing → collection or delivery → review → submit → confirmation. Payment, invoicing, inventory and ordering are separate concerns:
- **payment**: `paymentStatus` (`unpaid` → `paid`/`void`). Payment happens in person. Nothing marks an order paid on submission, and no card data is requested.
- **invoicing**: none. The checkout says so.
- **inventory**: none. Orderability flags only.

## Checkout UI

`CheckoutForm` is one flow with four panels (Kosár, Adatok, Átvétel és szállítás, Összesítés); the fifth stage (Visszaigazolás) is the confirmation page and only appears after the order was created. `CheckoutProgress` shows a framer-motion progress fill (scaleX, so reduced-motion users get no movement) with numbered stages: completed stages show a check icon and can be clicked to go back, the current stage is ring-marked with `aria-current="step"`, upcoming stages are outlined; small screens show "n/5. lépés: …". Panels change through `AnimatePresence mode="wait"` with a short fade and horizontal slide in the navigation direction; the outgoing panel ignores pointer input. Form state lives in the parent, so going back keeps all data. "Tovább" never advances past invalid required fields and focuses the first invalid control; after a successful step change focus moves to the new panel heading. Submission is guarded against duplicates (ref + loading button) and failures keep the customer on the relevant panel with the message.

## Checkout validation (server)

`orderService.placeOrder(input: unknown)`:
1. Validates with `checkoutSchema` (Hungarian messages). Prices are not part of the payload; any extra browser fields are stripped.
2. Delivery method: must exist and be enabled. Fee `unknown` → rejected ("nincs meghatározott díja"). `free` → 0. `fixed` → amount. Unknown is never treated as zero.
3. Delivery requires a shipping address. Collection ignores and does not store one.
4. Re-quotes every line on the server. Any line that is not orderable rejects the order.
5. Builds the immutable snapshot and inserts it with `addOrder` (idempotent). The order, its *submitted* audit entry and the `order-received` (customer) and `store-new-order` (store) email jobs commit in **one transaction**.
6. Attempts delivery after commit. A failed email stays queued for the scheduler and never undoes the order.

## Submission snapshot

`order.submission` holds product/variant names, SKU, attributes including HEX, unit price, quantity, line totals, catalog price at submission, price source, delivery method and fee, currency and totals, customer, billing/shipping addresses, note, terms and privacy versions with acceptance time. Nothing ever rewrites it: the Payload `Orders` hook (`protectOrder`) rejects changes to snapshot, price, proposal and cancellation fields from every API.

`order.agreed` holds the currently agreed prices. It starts equal to the submission and changes only when the customer accepts a proposal (`source: 'price_change'`, `proposalId`).

## Price quotes (catalog changes after add-to-cart)

- `quoteService` issues an HMAC-signed token `{sku, unitPrice, issuedAt, expiresAt}` (72 h) for every cart line. The browser stores it opaquely.
- At submission, a token that is valid, unexpired and for the same SKU keeps its quoted price, even if the catalog price has since risen. A lower current catalog price always wins. Expired, tampered or foreign quotes fall back to the catalog price.
- If a kept quote is below the catalog price, the order gets `needsPriceReview = true` and an event. The store then decides whether to start a price-change proposal. There is **no** mandatory pre-submission approval.

## Idempotency

The checkout form creates a UUID idempotency key (kept in sessionStorage until success). The server hashes the canonical payload (without the key). Same key + same payload → the same order (`created: false`, no duplicate emails). Same key + different payload → `CONFLICT`.

## Fulfillment

States: Beérkezett → Ellenőrzés alatt → Visszaigazolva → Beszerzés folyamatban → Átvehető (collection) / Kiszállítás alatt (delivery) → Teljesítve, plus Törölve. Transitions are listed in `config/order-rules.ts` and enforced in `orderService` and the Payload hook. Updates use optimistic concurrency (`version`, checked under a row lock). Customer emails per status transition are governed by the switches in *Értesítési beállítások* (see [admin-operations.md](admin-operations.md#notification-settings-értesítési-beállítások)), applied centrally in the Orders hook. Cancellation by the store requires a reason.

## Audit trail

Every order change writes append-only `order-events` entries in the same transaction (actor from the server-side context, previous/new values, reason, related proposal/email). See [admin-operations.md](admin-operations.md#audit-history).

## Price-change proposals

`priceChangeService.createProposal({ orderReference, lines, explanation, supersedeActive })` (admin):
- Not allowed for dispatched, completed or cancelled orders. At least one price must actually change.
- **One active proposal per order.** Replacing one requires `supersedeActive: true`. The old proposal becomes `superseded`, its links stop working, and history records both. The new proposal gets its own response period from its own successful send. The old deadlines are kept on the old record, never silently moved.
- Creating a proposal sets `priceApprovalStatus = pending`, which **holds fulfillment** (status changes other than cancel are refused).
- The original prices are taken from the agreed prices. Totals are recomputed with integer arithmetic. Delivery fees are unchanged.

### Decision links

- The token for each proposal email is derived as `HMAC(APP_SIGNING_SECRET, proposalId + kind)`, so a retry renders exactly the same email and the raw token is never stored. Only `sha256(token)` is stored, and only after Resend accepted the email. A superseded proposal's links stop working because its status is no longer pending.
- `GET /arvaltozas/{token}` is read-only (`getDecisionView`). It shows old/new prices, consequences and the deadline. Pages are `noindex` and `no-referrer`.
- Decisions are explicit POST server actions. Accept, or reject, which requires a confirmation checkbox. Then a redirect (PRG).
- **Accept** → `agreed` = proposed prices, `priceApprovalStatus = accepted`, history entry, confirmation email.
- **Reject** → the whole order is `cancelled` (`price_change_rejected`), payment `void`, cancellation email.
- Replayed, superseded, withdrawn or expired links show a safe "already closed" message and change nothing. Unknown tokens show "invalid".

## Reminder and cancellation timing

All times are stored in UTC and shown in Europe/Budapest.

```
proposal email successfully sent  (T0 = proposalEmail.sentAt)
  └─ +24 h, no decision → send ONE reminder   (T1 = reminderEmail.sentAt)
        └─ +24 h after T1, no decision → expire + cancel whole order + timeout email
```

- A failed attempt does not start a period. The scheduler retries the proposal email until it succeeds, and only then does T0 start. A delayed or failed reminder still gives the customer the **full** 24 h after it is actually sent.
- Each proposal/reminder is one persisted email job (stable key); delivery attempts run under a **claim** (row lock), so concurrent or retried scheduler runs cannot send twice. A claim older than 10 minutes counts as interrupted and may be retried.
- "Successfully sent" means **Resend accepted the request**. In logging mode (`EMAIL_MODE=log`) or with a broken configuration nothing starts: the proposal stays pending with an explanatory `lastError`, and no reminder or expiry is ever scheduled for it.
- Demo (historical) proposals are never loaded by the scheduler.

## Scheduler

`GET /cron/process` (Vercel cron, every minute, `Authorization: Bearer CRON_SECRET`) runs `schedulerService.runOnce()`: due email jobs (with backoff), then proposals (unsent proposal emails, due reminders, expiry). Everything is stored in the database; there are no in-memory timers and no fire-and-forget work. Timing tolerance is one cron interval: a reminder may be sent up to ~1 minute (Pro plan) late, but the final 24 h are counted from its actual acceptance, so the customer never loses time; expiry may also run up to one interval late, and a decision arriving after the deadline loses anyway (see Races). Vercel may skip or duplicate a run; both are harmless. In development, *Ütemező futtatása* on `/fejlesztes` runs the same tick.

### Races

Acceptance, rejection, expiry and withdrawal all go through `resolveProposal`, a compare-and-set from `pending`. Exactly one wins, and the loser gets `already_resolved`. A customer decision made after the final deadline loses even if the scheduler hasn't run yet: `decide` performs the expiry first. GET views show such proposals as expired without mutating anything.

### Tests

`src/tests/price-change.test.ts` (real PostgreSQL, Resend SDK mocked, controllable clock) covers: hold and accept with the original snapshot kept, whole-order rejection, ineligible and demo orders, reminder at 24 h and expiry 24 h after the reminder (to the millisecond), failed sends and a delayed reminder still giving the full final window, logging mode starting no deadline, a three-way accept/reject/expire race, replayed/superseded/invalid tokens, GET non-mutation, and token/link redaction in storage and logs.
