# Ordering and price changes

## Business model

Preorder only: cart → contact/billing → collection or delivery → review → submit → confirmation. Payment, invoicing, inventory and ordering are separate concerns:
- **payment**: `paymentStatus` (`unpaid` → `paid`/`void`). Payment happens in person. Nothing marks an order paid on submission, and no card data is requested.
- **invoicing**: none. The checkout says so.
- **inventory**: none. Orderability flags only.

## Checkout validation (server)

`orderService.placeOrder(input: unknown)`:
1. Refuses when `APP_ENV`/`VERCEL_ENV` is `production` (sample checkout disabled).
2. Validates with `checkoutSchema` (Hungarian messages). Prices are not part of the payload; any extra browser fields are stripped.
3. Delivery method: must exist and be enabled. Fee `unknown` → rejected ("nincs meghatározott díja"). `free` → 0. `fixed` → amount. Unknown is never treated as zero.
4. Delivery requires a shipping address. Collection ignores and does not store one.
5. Re-quotes every line on the server. Any line that is not orderable rejects the order.
6. Builds the immutable snapshot and inserts it with `addOrder` (idempotent).
7. Sends `order-received` (customer) and `store-new-order` (store). Failures are recorded on the order and never undo it.

## Submission snapshot

`order.submission` holds product/variant names, SKU, attributes including HEX, unit price, quantity, line totals, catalog price at submission, price source, delivery method and fee, currency and totals, customer, billing/shipping addresses, note, terms and privacy versions with acceptance time. Nothing ever rewrites it. The Payload `Orders` hook rejects changes to snapshot fields.

`order.agreed` holds the currently agreed prices. It starts equal to the submission and changes only when the customer accepts a proposal (`source: 'price_change'`, `proposalId`).

## Price quotes (catalog changes after add-to-cart)

- `quoteService` issues an HMAC-signed token `{sku, unitPrice, issuedAt, expiresAt}` (72 h) for every cart line. The browser stores it opaquely.
- At submission, a token that is valid, unexpired and for the same SKU keeps its quoted price, even if the catalog price has since risen. A lower current catalog price always wins. Expired, tampered or foreign quotes fall back to the catalog price.
- If a kept quote is below the catalog price, the order gets `needsPriceReview = true` and an event. The store then decides whether to start a price-change proposal. There is **no** mandatory pre-submission approval.

## Idempotency

The checkout form creates a UUID idempotency key (kept in sessionStorage until success). The server hashes the canonical payload (without the key). Same key + same payload → the same order (`created: false`, no duplicate emails). Same key + different payload → `CONFLICT`.

## Fulfillment

States: Beérkezett → Ellenőrzés alatt → Visszaigazolva → Beszerzés folyamatban → Átvehető (collection) / Kiszállítás alatt (delivery) → Teljesítve, plus Törölve. Transitions are listed in `config/order-rules.ts` and enforced in `orderService` and the Payload hook. Updates use optimistic concurrency (`version`). Customer emails go out for confirmed, ready for collection, dispatched and completed.

## Price-change proposals

`priceChangeService.createProposal({ orderReference, lines, explanation, supersedeActive })` (admin):
- Not allowed for dispatched, completed or cancelled orders. At least one price must actually change.
- **One active proposal per order.** Replacing one requires `supersedeActive: true`. The old proposal becomes `superseded`, its links stop working, and history records both. The new proposal gets its own response period from its own successful send. The old deadlines are kept on the old record, never silently moved.
- Creating a proposal sets `priceApprovalStatus = pending`, which **holds fulfillment** (status changes other than cancel are refused).
- The original prices are taken from the agreed prices. Totals are recomputed with integer arithmetic. Delivery fees are unchanged.

### Decision links

- Each sent email gets a fresh random 256-bit token. Only `sha256(token)` is stored, and only after the send succeeded.
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
- Each email is sent under a **claim** (`claimProposalEmail`), so concurrent or retried scheduler runs cannot send twice. A claim older than 10 minutes counts as interrupted and may be retried.
- In sample mode, "successfully sent" means `emailService` returned `sent_simulated`. With Resend, it will mean the provider accepted the API request.

### Races

Acceptance, rejection, expiry and withdrawal all go through `resolveProposal`, a compare-and-set from `pending`. Exactly one wins, and the loser gets `already_resolved`. A customer decision made after the final deadline loses even if the scheduler hasn't run yet: `decide` performs the expiry first. GET views show such proposals as expired without mutating anything.

### Tests

`src/tests/price-change.test.ts` uses the controllable clock (`clock.set/advance`) to cover: hold and accept, whole-order rejection, ineligible orders, reminder at 24 h and expiry 24 h after the reminder (boundary to the millisecond), failed sends and retries without consuming periods, an accept-vs-expire race, deadline enforcement at decision time, replayed/superseded/invalid tokens, GET non-mutation, and log redaction.
