# Content and business settings

Everything the store team edits without a deployment lives under **Beállítások** in the admin. The storefront renders
on request (`force-dynamic`, no data cache), so a saved change is visible on the next page load; nothing needs
invalidating.

| Sidebar entry | Kind | What it controls |
| --- | --- | --- |
| **Áruház beállítások** | global `store-settings` | Store name, slogan, logo, favicon and contact, GYIK, business rules, legal pages (tabs below) |
| **Főoldal beállítások** | global `homepage-settings` | Hero, featured-products grid, highlights |
| **Fizetési és szállítási beállítások** | global `payment-settings` | Payment page texts, delivery methods and fees, collection point |
| **Email beállítások** | global `email-settings` | Sender and store recipient; status emails per order status |

Access: read is public except Email beállítások (admins only); editing needs an admin who has finished the first-login
password change.

## Áruház beállítások (tabs)

The tabs and sections only organize the form: field names and database columns are unchanged.

- **Áruház**, in this order, without extra sections:
  - **Webshop neve**: header text logo, footer, emails, browser title template.
  - **Szlogen**: in the footer under the store name (empty: not shown).
  - **Logó**: PNG, WebP, JPEG, AVIF or SVG, for the dark header and footer; shown at a fixed height with its own
    proportions; empty → the store name as text.
  - **Favicon**: PNG (square, ≥ 32 × 32), SVG or ICO; set through Next.js metadata; no static `app/favicon.ico` or
    `app/icon.*` takes precedence; empty → browser default.
  - **Kapcsolat**: email, phone, address (header/footer and contact page).

  Logo and favicon offer Payload's own *upload new* and *choose existing*; files go to the **Arculati képek** collection (no sidebar entry; Payload's upload and list drawers open it from these fields),
  stored under `branding/` without a product path, with the format checked on the server. Deleting a file in use only
  empties the setting. Payload's own admin branding is unchanged.
- **GYIK**: the questions of `/gyik`. The entries are records of the `faqs` collection, the single source of the page,
  which has no sidebar entry of its own. The tab lists them in their stored order with their state (*rejtett* = not
  published); **Szerkesztés** and **Új kérdés** open Payload's document drawer (question, answer, **Megjelenik**), and
  the arrows move an entry through Payload's own reorder endpoint (the same order key as drag and drop). An entry is
  saved on its own: the store settings do not need saving for FAQ changes. The page title and metadata of `/gyik` are
  code-managed.
- **Üzleti szabályok**: see below.
- **Jogi és tájékoztató oldalak**: legal document versions (stored on each order and message) and the `/info/<slug>`
  pages (ÁSZF, adatvédelem, garancia).

## Fizetési és szállítási beállítások

The visible content of `/fizetes-es-szallitas` (title, introduction, section headings, payment list, preorder steps),
the delivery methods (`free` = 0 Ft or `fixed` amount; a database rule keeps a fixed fee whole and non-negative) and
the collection point (address, opening hours, note). The checkout, order placement, the page and the "ready for
collection" email all read this one source; fees are formatted with the shared HUF formatter. Page metadata is
code-managed.

## Email beállítások

**Kapcsolati e-mail** (recipient of contact-form messages and store notifications) and **Feladó (From)**, validated,
read on every send, so a change applies at once ([email.md](email.md#sender-and-store-address-store-settings)). The
transport (`EMAIL_MODE`, `RESEND_API_KEY`) and all secrets stay in environment variables. The whole global is
admin-only; the two former recipient fields are kept hidden and unused. One page, no tabs: **Feladó** and **Kapcsolati e-mail** side by side, then
the status-email group, one switch per order status for the automatic customer email (applied to every status
change; a switched-off status is logged as *Kihagyva*; order confirmation, store notification and price-change emails
are always sent).

## Főoldal beállítások

Hero title and text; the labels of the two hero buttons (their targets stay `/termekek` and `/gyik`); **Kiemelt
termékek** (heading, product count, desktop columns 2–4, desktop rows 1–6); highlights. The count must fit rows ×
columns (rejected with a Hungarian message otherwise), e.g. 3 = 1 × 3, 6 = 2 × 3, 8 = 2 × 4. Up to *count* products
marked "Kiemelt" are shown; fewer fill the grid partially (no placeholders). Phones show one column and tablets two;
from `lg` the grid steps up to the configured columns. Homepage metadata is code-managed.

## Üzleti szabályok (Áruház beállítások)

| Setting | Default | Bounds | Applied by |
| --- | --- | --- | --- |
| Max. darab tételenként | 5 | 1–99 | cart, product pages, quote action, order placement |
| Max. különböző tétel | 20 | 1–100 | cart, quote action, order placement |
| Árváltozás: első válaszidő (óra) | 24 | 1–336 | new price-change proposals |
| Árváltozás: emlékeztető utáni válaszidő (óra) | 24 | 1–336 | new price-change proposals |

Values are whole numbers validated on the server. The ceilings (`TECHNICAL_LIMITS`) and the cart price-quote validity
(72 h) stay in `src/config/shop.ts`. The browser cart gets the limits from the layout; the server checks them again in
`lib/cart-limits.ts`. Existing orders are never re-checked, so lowering a limit does not change them.

Each proposal **snapshots** both response periods when it is created (`responseHours`, shown read-only on the
proposal). The reminder is due *initial* hours after the proposal email was successfully submitted, and expiry is
*reminder* hours after the reminder was submitted. Changing the setting affects only proposals created afterwards;
running ones keep their deadlines. Proposals that existed before the migration got 24 h / 24 h, the periods they were
created under.

## SEO

Editable only per **product, brand and category** (their *SEO* group: title, description). The page uses them in the
standard, Open Graph and Twitter metadata; empty fields fall back to the name and description
(`src/lib/metadata.ts`). Canonical URLs and the product slug redirects are unchanged.

Everything else is code-managed: the default title and description and the title template (`src/config/seo.ts`, the
values formerly in *SEO alapértékek*), and the metadata of the homepage, the listing pages, `/fizetes-es-szallitas`,
`/gyik`, `/kapcsolat`, the information pages and the combined brand + category pages. Canonical URLs use the configured
`NEXT_PUBLIC_SITE_URL`.

## Migrations

`20261127_152944_content_settings_restructure` (additive): new tables and columns, with the former hardcoded texts
and limits as column defaults, so the existing settings row keeps its behavior; plus the payment-page lists, FAQ
entries and footer slogan (idempotent). `20261127_153043_remove_general_seo_settings`: logs the old general SEO values
(warning if they differ from `src/config/seo.ts`), then drops those two columns; `down` restores them with the code
values. Run `npm run migrate` before deploying this code.

`20261127_155841_settings_pages_split` (additive): creates Email and Főoldal beállítások and the Fejléc/Lábléc fields of
Áruház beállítások, then copies the existing values there (email fields incl. the hidden legacy ones, homepage fields
and highlights, logo, favicon, slogan; each only into an empty target). `20261127_155926_remove_moved_settings` drops
the old columns and the former header/footer globals, and refuses to run (nothing dropped) if the copies are missing.
FAQ records are untouched (same collection).

`20261127_163034_remove_listing_titles`: the listing-page titles are code-managed again; logs the stored values, then
drops the columns. `20261127_163234_payment_settings_global` / `20261127_163314_remove_payment_from_store`: copy the
payment page, delivery methods (row ids, order, fees, the fixed-fee rule) and collection point to Fizetési és
szállítási beállítások, then drop the old ones (refused if a copy is incomplete).
`20261127_163632_status_emails_into_email_settings` / `20261127_163659_remove_notification_settings`: copy the
per-status switches into Email beállítások, then drop Értesítési beállítások (refused if a saved value differs).
