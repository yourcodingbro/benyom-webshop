# Admin operations (Payload admin, `/admin`)

Everything operational happens in Payload's native admin, with Hungarian labels. Every operation requires an authenticated user with the `admin` role; custom actions call admin-only endpoints that re-check the session and delegate to the same services the storefront and scheduler use. Business rules live in the services, never in admin components.

## Sidebar groups

Groups, in this order: *Rendelések* (orders, audit log, proposals, sales log), *Bolt* (media, brands, categories, products, imports), *Értesítések* (email history, delivery events, contact messages), *Rendszer* (users), *Beállítások* (store and notification settings). Labels and order live in `src/collections/utils/nav-groups.ts` (`NAV_GROUPS`, `NAV_GROUP_ORDER`); every collection and global references them. Payload has no group-order option, so `admin.components.Nav` (`OrderedNav`) renders Payload's own `DefaultNav` with the collections and globals sorted by group: appearance, collapse state, access-based visibility, active links and the mobile menu are native, and order inside a group stays the registration order. Limitation: Payload groups collections before globals, so a group containing only globals cannot be placed before groups with collections (true today: *Beállítások* is last); `src/tests/admin-nav.test.ts` checks the order.

## Orders (*Rendelések*)

- **List**: search by reference, customer name, email or phone; filter by fulfillment status, price-approval status, date and the *DEMÓ* flag; newest first.
- **Detail** (tabs): status and actions, items and prices (submission snapshot and agreed prices), customer and delivery, history.
- **Status change**: the *Teljesítési állapot* field. Only allowed transitions are accepted (`config/order-rules.ts`); fulfillment is paused while a price decision is pending; collection/delivery-specific states are enforced. Concurrent saves are rejected (`version` check under a row lock).
- **Handover, payment, completion**: on "Átvehető" or "Kiszállítás alatt" orders the panel *Átadás, fizetés és teljesítés* records what happened: *Átadva, kifizetve – teljesítés* (receipt + payment + completion in one step), or *Csak átvétel rögzítése*, *Csak fizetés rögzítése* and *Teljesítés* separately. Payment can also be set in the *Fizetés* field. "Teljesítve" is accepted only when the customer's receipt and the payment are recorded, through every path (form, API, services); it stamps `completedAt` and `saleRecordedAt`. Payment is never inferred from dispatch or a status change. After completion the handover facts are final. Every step is audited (*Átvétel rögzítve*, *Fizetés*, *Állapot*, *Eladás rögzítve*).
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

## Brand and category order (*Márkák*, *Kategóriák*)

Drag rows by the handle at the start of each row on the brand and category lists (Payload's native `orderable` list). Keyboard: Tab to the handle, Space to pick up, arrow keys to move, Space to drop (Escape cancels). The list must be sorted by the order column (the default). The order is stored as fractional-index keys in `_order` (`COLLATE "C"`): a move rewrites only the moved row, so concurrent moves never corrupt the order; equal keys fall back to the id. Moving across pages: show more rows per page first. This manual order drives the storefront navigation, *Összes márka*/*Összes kategória* and the catalog filters. Product relationship fields have no reordering. The old *Sorrend* and *Népszerűségi sorrend* numbers are hidden and unused (kept in the database; they seeded the initial order).

## Products (*Termékek*, *Médiatár*)

Manual create/edit with drafts and publishing. Validation is shared with the CSV import: unique slug, globally unique upper-case SKUs, `#RRGGBB` colors (normalized), integer forint prices, procurement min ≤ max. Catalog edits never change existing orders (they keep their snapshots and agreed prices).

- **Id.** A new product gets a server-generated UUID. It is shown read-only in the edit view (*Azonosító*), not in the create view or as a list column, and never changes (existing ids such as `prod-iphone-17` stay as they are; relations, orders and the CSV import use it).
- **Live slug.** In the create form the slug follows the name as you type (the same `slugify` as the server). Typing in the slug field (or uploading an image, which reserves the slug) stops that for good in that form. On saved products a name change never touches the slug. The field has no helper text; validation errors still appear under it. On save, a following slug that is taken gets the generated-slug suffix (`-2` …) and the saved value is shown after the redirect to the edit view; a hand-typed taken slug is a field error. The "following" state travels as the form-only virtual field `slugAuto` (not stored) and is honored only on create.
- **Slug.** Left empty, it is generated from the full name (`Nothing Phone (3)` → `nothing-phone-3`; accents folded, separators to hyphens), made unique with `-2`, `-3` …; concurrent creations are safe (candidates are claimed in `product-slug-reservations` with `INSERT … ON CONFLICT` inside the product's transaction). Admins may edit it: the server normalizes the value (`iPhone 17 Új` → `iphone-17-uj`) and refuses, as a field error, a slug used by another product now or formerly, or reserved by an unsaved form; it is never silently changed. Renaming the product never changes the slug.
- **Slug changes.** The former slug is stored in `product-slug-history` pointing at the product, so `/termek/<former>` answers **308** to the current URL in one hop (no chains; the variant query is kept). A product taking a former slug back removes it from the history (no loops); a former slug cannot be used by another product. Media keep their object keys and URLs; later uploads use the saved current slug. The storefront renders on request (no page cache), so canonical URL, sitemap and links follow immediately.
- **Brands and categories inline.** The *Márka* and *Kategóriák* fields have Payload's native "+" button: the new record is created in a drawer from its name alone (slug and id generated, `-2` on duplicates) and selected automatically; the product form keeps its unsaved values.
- **Primary category.** *Elsődleges kategória* (default: the first selected category; reset to it when it is removed from the categories) decides the media path of multi-category products. Existing products were backfilled with their first category.
- **Images.** *Képek* and each variant's *Változat képei* choose existing media natively, or upload new files with *Új kép feltöltése*. The server derives the path `brand-slug/primary-category-slug/product-slug/[color-hex]/name-<random>.ext` from the stored brand and category records and the product's stored slug (or, before the first save, the slug reserved by the first upload, which the form then keeps and saves). Upload is disabled, with the reason shown, until brand, category and name are set; variant uploads also need a valid HEX color. The server checks the same, accepts WebP/JPEG/PNG/AVIF up to 10 MB (extension from the actual type) and never takes a path from the browser. Free-form creation in the *Médiatár* is closed; storage fields are read-only.
- **After upload** files are never moved or renamed: renaming the product or changing brand, category or color affects only later uploads. Media used by a product cannot be deleted. Product-form uploads that no product or saved version references are removed by the scheduler after 7 days (the slug reservation period); imported or shared media are never cleaned up.

## CSV import (*Termékimportok*)

One collection, one menu entry (*Bolt → Termékimportok*):

- **List**: the import history with status (*Előnézet kész*, *Folyamatban*, *Befejezve*, *Sikertelen*), file, who started it and when it finished.
- **Új létrehozása**: download the template, upload the CSV and run the **dry run**. The dry run is stored as a new record and opens its detail view; nothing else changes.
- **Detail**: status and progress, the preview report and (after applying) the result report with counts and row-level errors. The only way to apply is the explicit *Import megerősítése és alkalmazása* (with a confirmation). An interrupted run shows *Folytatás*, a failed one *Újrapróbálás*; both skip the product groups already recorded, so nothing is applied twice.

There is no editable form: both views are the collection's `views.edit.root` component, and the collection refuses any create that does not come from the dry run (a form save or `POST /api/import-jobs` cannot start or fake an import). Details: [csv-import.md](csv-import.md).

## List views

In every collection list, clicking the empty or plain-text area of a row opens that record, exactly like the link in the first column (Ctrl/⌘/Shift-click or middle-click: new tab). Checkboxes, bulk actions, links, buttons, drag handles and other controls keep their own action, selecting text does not navigate, and keyboard users use the first-column link (rows add no tab stops). Read-only collections open their protected, read-only detail view. One shared admin provider (`ClickableListRows`) does this for all lists; lists inside drawers are not affected.

## Notification settings (*Értesítési beállítások*)

One switch per status transition for automatic customer emails (Ellenőrzés alatt, Visszaigazolva, Beszerzés folyamatban, Átvehető, Kiszállítás alatt, Teljesítve, Törölve – bolti törlés). Applied centrally to every status change (admin form, API, services). A disabled transition is recorded in the email history as *Kihagyva* with the reason and logged. Changing a switch never re-sends past notifications; saving an order without a status change sends nothing. These switches are separate from `EMAIL_MODE`. Order confirmation, store notification and all price-change emails (proposal, reminder, decision, timeout) are part of the workflow and always sent.

## Email history (*E-mail előzmények*)

Every application email (customer, store, contact form): template, recipient, sender, subject, related order/proposal/message, timestamps, mode, status, Resend id, attempts, sanitized error, skip reason, and a snapshot of the rendered content with decision links removed. Failed emails can be retried safely from the detail view. See [email.md](email.md).

## Admin accounts (*Felhasználók*)

- **Invite:** *Új admin meghívása* above the user list takes only an email address. The server generates a 20-character random temporary password (`generateTemporaryPassword`), stores it only through Payload's native hashing and emails it with the *Admin meghívó* template via `emailService.sendEmail()`. Admins cannot type a password and cannot create users through the API (`create` is closed); the very first user still comes from Payload's first-registration screen.
- **Never stored in plain text:** the password is redacted from the email history snapshot, absent from logs, audit and job payloads. Only a keyed fingerprint (HMAC, never readable through any API) is kept to reject its reuse.
- **Expiry:** `ADMIN_TEMP_PASSWORD_TTL_HOURS` (default 72). An expired temporary password is refused at login and cannot be used to change the password.
- **Delivery:** the form reports the real outcome: sent (accepted by Resend), *naplózó mód* (`EMAIL_MODE=log`: nothing sent, the invitee cannot sign in) or failed (with the sanitized error). The invitation email cannot be retried, because the password is not stored.
- **Regenerate:** the user's edit view shows the expiry and the last invitation email status; *Új ideiglenes jelszó és újraküldés* issues a new password and a new email, and immediately invalidates the previous password and all of the user's sessions. Not available for yourself or for activated users.
- **First login:** while `mustChangePassword` is set, the server refuses every collection, global, GraphQL, custom endpoint and `/fejlesztes` server action to the user (`isAdminRequest`, `getAdminAuthorization`); only *me*, the password change and logout work. The admin UI redirects to *Jelszócsere* (`/admin/jelszocsere`) for convenience.
- **Password change:** at least 12 characters (max 128), at least three of lowercase/uppercase/digit/symbol, no leading or trailing space, no character repeated 4×, must not contain the email name, must differ from the temporary password. On success the password, the cleared flag, expiry and fingerprint and the emptied session list are written in one transaction; the user signs in again with the new password.
