# Email

Templates are React Email components (`src/emails/*.tsx`), rendered to Hungarian HTML and plain text. Every email is a **persisted job** in the `email-messages` collection (also the admin-visible email history) and is delivered only by `emailService` ([src/services/emailService.ts](../src/services/emailService.ts)), the only module that imports the Resend SDK.

## Interface

- `emailService.sendEmail(input)` – unchanged interface. Persists the job (stable idempotency key), attempts delivery once and returns `sent` (accepted by Resend), `sent_simulated` (logging mode) or `failed`. A job that was already submitted is never sent again.
- `notificationService.queue(input, req)` – persists a job inside the caller's transaction (e.g. together with a new order or a proposal decision); `notificationService.deliver(ids)` sends after commit.
- `emailService.processDue(limit)` – the scheduler's step: due jobs, oldest first.
- `emailService.retry(id, auth)` – admin retry of a failed job (same key).
- `emailService.handleWebhook(rawBody, headers)` – verified Resend events.

Jobs store **references only** (`templateRef`: template id, order reference, proposal id, contact message id, status). At send time the template is rebuilt from current data, so no tokens, links or rendered content are needed to retry.

## Delivery modes (`EMAIL_MODE`)

Independent of the database and of the per-status notification switches.

| Mode | Behaviour |
| --- | --- |
| `log` (default) | Rendered, stored in the history as **Naplózva (nem küldött)**, metadata logged. Nothing is sent. Price-change proposals are **not** treated as sent: no customer deadline starts. |
| `resend` | Sent through Resend with `idempotencyKey` = the job's key. Requires `RESEND_API_KEY`, `EMAIL_FROM` (verified domain) and `CONTACT_EMAIL`. |
| invalid configuration | Every attempt fails visibly with the configuration problem and is retried with backoff; there is never a fallback to simulated success. |

## Status model

| Status | Meaning |
| --- | --- |
| `queued` | Waiting for a (re)try; `nextAttemptAt` and `lastError` show why |
| `submitted` | **Accepted by Resend** (provider message id stored). Not a delivery confirmation |
| `delivered` | Confirmed by the `email.delivered` webhook |
| `failed` | Permanent provider error (400/401/403/404/422) or retries exhausted |
| `bounced`, `suppressed` | From webhook events |
| `cancelled` | No longer applicable (e.g. proposal already decided, demo data) |
| `skipped` | Switched off in *Értesítési beállítások*; the reason is stored and logged |
| `simulated` | Logging mode |

## Retries

Transient failures (network, 429, 5xx, invalid configuration, unexpected errors) re-queue the job with backoff: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h, 24 h, then `failed`. Every attempt uses the same idempotency key, so Resend deduplicates a request that was accepted but whose response was lost. Claims (row lock + `claimedAt`, stale after 10 minutes) prevent concurrent sends. A retry never creates another proposal and never moves a deadline: proposal deadlines start only from the provider's acceptance of the email, recorded once.

Admins can retry `failed` (or stuck `queued`) emails from the email detail view. Submitted or delivered emails cannot be re-sent.

## Webhooks

`POST /webhooks/resend`: the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`) is verified over the **raw body** with `RESEND_WEBHOOK_SECRET` using the Resend SDK. Each event is stored once (`email-events`, unique `svix-id`); redeliveries return `duplicate`. Status changes only move forward (`submitted` → `delivered` → `bounced`/`failed`/`suppressed`), so out-of-order events cannot downgrade an email. Delivery and bounce events are added to the order's audit trail.

## History, previews and sensitive data

- The detail view shows a **snapshot** of the rendered HTML (sandboxed iframe) and text, stored once at the first send attempt, so template changes never rewrite history.
- Decision links are **redacted** before storage (`[döntési link – a naplóból eltávolítva]`). Raw decision tokens are never stored: they are HMAC-derived from the proposal id when sending, and only their SHA-256 hash is saved after the provider accepted the email.
- Server logs contain metadata only (template, recipient, reference, status, attempt count): never bodies, links, tokens, reply-to addresses or keys.
- Email history, contact messages and webhook events are readable only by admins and cannot be created or changed through any API.
- There is no separate store of sensitive transport data: everything needed to retry is re-derived. Contact-message content stays in `contact-messages` (admin-only); delete messages there when they are no longer needed.

## Setup

Local (`.env.local`, never committed):

```
EMAIL_MODE=log
```

Real delivery:

```
EMAIL_MODE=resend
RESEND_API_KEY=re_…
EMAIL_FROM=Webshop <rendeles@yourdomain.hu>
CONTACT_EMAIL=bolt@yourdomain.hu
RESEND_WEBHOOK_SECRET=whsec_…
```

On Vercel set them per environment (*Sensitive*), e.g. `log` for Preview and `resend` for Production, and register the webhook (see [deployment.md](deployment.md#vercel)).
