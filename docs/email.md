# Email

All transactional email goes through one server-only service:

```ts
type EmailService = { sendEmail: (input: SendEmailInput) => Promise<SendEmailResult> }
// SendEmailInput  = { to, replyTo, template: EmailTemplate, settings, orderReference, proposalId, idempotencyKey }
// SendEmailResult = { status: 'sent', messageId, sentAt }            // accepted by Resend
//                 | { status: 'sent_simulated', messageId, sentAt }  // EMAIL_MODE=log
//                 | { status: 'failed', attemptedAt, error }
```

`sendEmail` never throws for delivery problems. Failures come back as `{ status: 'failed' }`, so callers record them and can retry. An order is never cancelled or lost because an email failed. `isDelivered(result)` is true for `sent` and `sent_simulated`.

Callers: `notificationService.notify()` (order and price-change emails; appends a `NotificationRecord` to the order) and `contactService.submitContactMessage()`. A test enforces that nothing else calls `sendEmail` and that only `emailService.ts` imports `resend`.

## Delivery modes (`EMAIL_MODE`)

| Mode | Behavior |
| --- | --- |
| `log` (default, also when unset) | Renders the template, logs metadata as `[EMAIL – SZIMULÁLT, NEM KÜLDÖTT]`, stores a development preview (dev tools only), returns `sent_simulated`. Nothing leaves the process. The `/fejlesztes` failure simulation applies only here. |
| `resend` | Sends through Resend. Returns `sent` with Resend's email id **only** when Resend accepts the request. Provider errors (`{ error: { name, statusCode, message } }`) and thrown exceptions become `failed`, e.g. `Resend hiba (rate_limit_exceeded, 429): …`. |
| anything else, or `resend` with missing/invalid settings | Every send returns `failed` with `Hibás e-mail-beállítás: …` and logs `[EMAIL – HIBÁS BEÁLLÍTÁS]`. There is **no** silent fallback to simulated success. |

Configuration (`src/config/email.ts`, read on each send, server-only):

| Variable | Required in `resend` mode | Notes |
| --- | --- | --- |
| `EMAIL_MODE` | – | `log` or `resend` |
| `RESEND_API_KEY` | yes | Must start with `re_`. Never logged, never returned, never sent to the browser. |
| `EMAIL_FROM` | yes | Verified sender: `Webshop <rendeles@yourdomain.hu>` or `rendeles@yourdomain.hu`. Every email is sent *from* this address. |
| `CONTACT_EMAIL` | yes | Recipient of new-order (`store-new-order`) and contact-form notifications. Optional in `log` mode; without it the sample settings addresses are used. |

None of these may use a `NEXT_PUBLIC_` prefix (Next.js would inline them into browser bundles). The config refuses `NEXT_PUBLIC_RESEND_API_KEY`, `NEXT_PUBLIC_EMAIL_FROM` and `NEXT_PUBLIC_CONTACT_EMAIL`.

## Content: React Email

- `src/emails/EmailLayout.tsx`: shared frame (dark header with red logo bar, sample notice, CTA button, footer) and building blocks `Paragraph`, `OrderItems`, `PriceComparison`. Styles are inline because email clients ignore stylesheets.
- `OrderEmails.tsx`, `PriceChangeEmails.tsx`, `ContactMessageEmail.tsx`: typed Hungarian templates plus subject functions.
- `index.tsx`: `renderEmail(template, settings)` renders HTML with `render(element)` and plain text with `render(element, { plainText: true })` (`@react-email/render`). Both versions are sent.

| Template id | When | To |
| --- | --- | --- |
| `order-received` | after submission | customer |
| `store-new-order` | after submission | `CONTACT_EMAIL` |
| `price-change-proposal` | proposal created / retried | customer |
| `price-change-reminder` | 24 h after the proposal email was accepted | customer |
| `price-change-accepted` | customer accepted | customer |
| `cancelled-after-rejection` / `-timeout` / `cancelled-by-store` | cancellation | customer |
| `fulfillment-update` | confirmed, ready for collection, dispatched, completed | customer |
| `contact-message` | contact form | `CONTACT_EMAIL`, **Reply-To: visitor** (the visitor is never the sender) |

## Idempotency and proposal timing

Every send carries a stable key for the logical notification: `templateId/orderReference[/proposalId][/status]`, or `contact-message/<submissionKey>`. Retries reuse the key and Resend deduplicates within its idempotency window (24 hours). If Resend accepted a request but the response was lost, the retry gets the original result instead of sending a second email.

For this to work, the retried request must be identical. So proposal and reminder emails:
- derive their decision token deterministically (`HMAC(APP_SIGNING_SECRET, proposalId + kind)`). Only the SHA-256 hash is stored, and only after acceptance;
- print a deadline anchored to the **first attempt** (`firstAttemptAt`). The real period starts at `sentAt`, the moment Resend accepted the email, which is never earlier, so the printed deadline is never later than the real one.

The proposal period (24 h → reminder) and the final period (24 h → cancellation) start only from a successful provider submission. Failed attempts keep `sentAt = null`, and the next scheduler run retries.

## Logging rules

Logs contain only status, recipient, subject (URLs and long tokens redacted), template id, order/proposal reference, provider message id, and the error text. They never include the API key, message bodies, decision links or tokens, the contact visitor's address (Reply-To), or billing/shipping data. HTML/text previews are stored only while dev tools are enabled (`/fejlesztes/email/{id}`) and are unreachable in production.

## Setup

### Local (`.env.local`)

`.env.local` is git-ignored; never put credentials in tracked files.

1. Logging only (default): no configuration needed, or `EMAIL_MODE=log`.
2. Real delivery:
   1. Create an API key in Resend (*API Keys*, "Sending access" is enough).
   2. Add and verify your domain in Resend (*Domains*: add the SPF/DKIM DNS records it shows; DMARC recommended). Until the domain is verified, Resend only allows its test sender.
   3. Create `.env.local`:
      ```
      EMAIL_MODE=resend
      RESEND_API_KEY=re_…
      EMAIL_FROM=Webshop <rendeles@yourdomain.hu>
      CONTACT_EMAIL=bolt@yourdomain.hu
      ```
   4. Restart `npm run dev`. The banner and the dev email log show the active mode.
3. Switch back by setting `EMAIL_MODE=log` (or removing it) and restarting.

Sample orders use customer addresses you type in. In `resend` mode real emails go to them, so use addresses you control.

### Vercel

*Project → Settings → Environment Variables*: add `EMAIL_MODE`, `RESEND_API_KEY` (mark it *Sensitive*), `EMAIL_FROM` and `CONTACT_EMAIL` per environment. A common setup is `EMAIL_MODE=log` for Preview and `resend` for Production. Redeploy after changes; the values are read at runtime on the server only.

## Limitations (sample mode)

- **No durable retries.** Notification state, proposal dispatch state and the email log live in the in-memory sample store. A failed customer email is recorded on the order, but only proposal/reminder emails are retried, and only when someone runs the scheduler (`/fejlesztes`). Order, fulfillment and contact emails are not retried automatically, and nothing survives a restart. Production needs a persisted outbox plus an authenticated scheduled job (see [deployment.md](deployment.md#scheduler)).
- **No delivery tracking.** Acceptance by Resend is not delivery. Bounces and complaints need Resend webhooks on an authenticated route, marking the notification and flagging orders whose proposal emails keep failing.
- Resend's idempotency window is 24 hours; retries later than that are treated as new requests.
