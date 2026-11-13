# Admin operations (Payload admin, `/admin`)

Everything operational happens in Payload's native admin, with Hungarian labels. Every operation requires an authenticated user with the `admin` role; custom actions call admin-only endpoints that re-check the session and delegate to the same services the storefront and scheduler use. Business rules live in the services, never in admin components.

## Orders (*Rendelések*)

- **List**: search by reference, customer name, email or phone; filter by fulfillment status, price-approval status, date and the *DEMÓ* flag; newest first.
- **Detail** (tabs): status and actions, items and prices (submission snapshot and agreed prices), customer and delivery, history.
- **Status change**: the *Teljesítési állapot* field. Only allowed transitions are accepted (`config/order-rules.ts`); fulfillment is paused while a price decision is pending; collection/delivery-specific states are enforced. Concurrent saves are rejected (`version` check under a row lock).
- **Cancellation**: *Rendelés törlése* in the order view, with a **mandatory reason** and a confirmation. A pending proposal is withdrawn in the same transaction. Cancelling through the status field is refused.
- Snapshot, price, proposal and cancellation fields cannot be edited in the form or through the API.
- **Demo orders** (initial import) are read-only for workflows: no status changes, proposals or emails.

## Audit history

Every change to an order writes append-only entries (`order-events`) **in the same transaction**:

- order creation (and demo import), status and payment changes, admin edits, notes;
- proposal creation, supersession, acceptance, rejection, expiry, withdrawal;
- cancellation with its reason;
- notification events (queued, skipped by configuration, submitted, failed, delivered, bounced).

Each entry has: order reference, action type, actor (admin user from the session, customer, or a named system process), timestamp, previous and new values, optional reason, related proposal and email. Actors are derived server-side; nothing from the request body is trusted. Entries cannot be created, changed or deleted through any API (including admins), and a database trigger rejects updates and deletes. The history is shown chronologically in the order's *Előzmények* tab and across all orders in *Rendelési napló*.

## Price-change proposals

In the order view, *Árváltozási ajánlat*:

1. Enter new unit prices and an explanation for the customer (if a proposal is pending, explicitly tick *felülírás*).
2. *Ellenőrzés* asks the server to compute the proposal (lines, original and proposed totals) without saving or sending anything. A warning appears when email is in logging mode (no real deadline would start).
3. *Ajánlat küldése az ügyfélnek* creates the proposal (holding fulfillment) and sends the email. The result says whether Resend accepted it (deadline started) or it will be retried.

Proposals (*Árváltozási ajánlatok*) are read-only in the admin; only the customer decides (decision page, POST) or the scheduler expires them. Rules and timing: [ordering-and-price-changes.md](ordering-and-price-changes.md).

## Products (*Termékek*, *Médiatár*)

Manual create/edit with drafts and publishing. Validation is shared with the CSV import: stable id (filled from the slug when empty), unique slug, globally unique upper-case SKUs, `#RRGGBB` colors (normalized), integer forint prices, procurement min ≤ max. Catalog edits never change existing orders (they keep their snapshots and agreed prices). Media need Supabase Storage; each file is stored at `brand/category/product/[color]/filename`, and media used by a product cannot be deleted.

## CSV import (*Termékimport (CSV)*, `/admin/termekimport`)

Download the template, upload a file, review the **dry run** (row-level errors, created/updated/skipped/failed counts) and apply. The job is persisted (*Termékimportok*): applying runs in time-boxed batches and records every finished product group, so a timeout or closed tab can be resumed without redoing or losing work. Details: [csv-import.md](csv-import.md).

## Notification settings (*Értesítési beállítások*)

One switch per status transition for automatic customer emails (Ellenőrzés alatt, Visszaigazolva, Beszerzés folyamatban, Átvehető, Kiszállítás alatt, Teljesítve, Törölve – bolti törlés). Applied centrally to every status change (admin form, API, services). A disabled transition is recorded in the email history as *Kihagyva* with the reason and logged. Changing a switch never re-sends past notifications; saving an order without a status change sends nothing. These switches are separate from `EMAIL_MODE`. Order confirmation, store notification and all price-change emails (proposal, reminder, decision, timeout) are part of the workflow and always sent.

## Email history (*E-mail előzmények*)

Every application email (customer, store, contact form): template, recipient, sender, subject, related order/proposal/message, timestamps, mode, status, Resend id, attempts, sanitized error, skip reason, and a snapshot of the rendered content with decision links removed. Failed emails can be retried safely from the detail view. See [email.md](email.md).
