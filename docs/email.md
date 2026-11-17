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
| `resend` | Sent through Resend with `idempotencyKey` = the job's key. Requires `RESEND_API_KEY` (env) and the **Feladó** store setting (sender on a verified domain); store notifications also need **Kapcsolati e-mail**. |
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

**Permanent rejections** (Resend 400/401/403/404/422) are not retried automatically: the job is `failed` with no next attempt, and the email view says so. Sender configuration errors are explained in Hungarian in the stored error, e.g. the Resend **testing restriction** (`403 validation_error: You can only send testing emails to your own email address`): the sender can only reach the Resend account owner's address; other recipients need a verified domain in Resend and a *Feladó* on that domain. The recipient is never changed to work around it. For an admin invitation, the account still exists and the outcome is reported separately (account created / email not sent); fix the sender, then use *Új ideiglenes jelszó és újraküldés*. The failed attempt stays in the email history with the temporary password redacted.

## Webhooks

`POST /webhooks/resend`: the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`) is verified over the **raw body** with `RESEND_WEBHOOK_SECRET` using the Resend SDK. Each event is stored once (`email-events`, unique `svix-id`); redeliveries return `duplicate`. Status changes only move forward (`submitted` → `delivered` → `bounced`/`failed`/`suppressed`), so out-of-order events cannot downgrade an email. Delivery and bounce events are added to the order's audit trail.

## History, previews and sensitive data

- The detail view shows a **snapshot** of the rendered HTML (sandboxed iframe) and text, stored once at the first send attempt, so template changes never rewrite history.
- Decision links are **redacted** before storage (`[döntési link – a naplóból eltávolítva]`). Raw decision tokens are never stored: they are HMAC-derived from the proposal id when sending, and only their SHA-256 hash is saved after the provider accepted the email.
- **One-shot secret emails** (`SendEmailInput.secrets`, used only by the admin invitation): the secret is redacted from the stored subject, HTML and text (`[ideiglenes jelszó – a naplóból eltávolítva]`) and never persisted, so such an email is sent exactly once. A failure is final (no scheduled retry, manual *retry* refused); the remedy is *Új ideiglenes jelszó és újraküldés* on the user.
- Server logs contain metadata only (template, recipient, reference, status, attempt count): never bodies, links, tokens, reply-to addresses or keys.
- Email history, contact messages and webhook events are readable only by admins and cannot be created or changed through any API.
- There is no separate store of sensitive transport data: everything needed to retry is re-derived. Contact-message content stays in `contact-messages` (admin-only); delete messages there when they are no longer needed.

## Contact form

`/kapcsolat` → `contactFormAction` (server action) → `contactService.submitContactMessage` (validation, anti-spam token, idempotent store in `contact-messages`) → `emailService.sendEmail` (`contact-message` React Email template, sender and store recipient from the store settings, visitor address as `replyTo`) → Resend → email history.

- **Progressive enhancement:** the form's `action` is the server action, so a submit before the page's JavaScript is ready (slow device, slow dev compile) still posts to the server. Before this, such a submit fell back to a plain GET: the message never reached the server and the visitor's data ended up in the URL. With JavaScript the handler calls the action directly (spinner, *Küldés…*, duplicate clicks ignored, values and consent kept on failure).
- **Immediate delivery:** the email is sent inside the submission. A transient provider failure is retried once more right away (awaited, same job and idempotency key); only if that also fails does the job wait for the scheduler. A permanent rejection (Resend 4xx, e.g. the testing-domain restriction) is not retried. Resubmitting the same message retries the same job and never creates a second message or email.
- **Honeypot:** the hidden anti-spam field is named `hp_kapcsolat` and marked for password managers to ignore. It used to be called `website`, which browsers and password managers autofill; a real message was then treated as spam, dropped before storing, and the form wrongly showed the log-mode notice. A filled honeypot now stores and sends nothing and says so (*spamszűrő visszatartotta*); the log-mode notice appears only for a real `EMAIL_MODE=log` result.
- **Honest result:** *elküldtük* only after Resend accepted the email (not inbox delivery); *rögzítettük, a továbbítás folyamatban* when a retry is scheduled; *rögzítettük – e-mail nem ment ki* in log mode; a stored message with a final failure says so and that it need not be resent.
- **Diagnostics:** `[KAPCSOLAT] { correlationId: contact-<submission key prefix>, stage: validation | honeypot | form-token | email, outcome }` and `[EMAIL] { correlationId: eml-<job id>-<attempt>, stage: template | settings | render | config | recipient | provider, status, template, to: masked, attempts, retryScheduled, messageId, error }`. Never the API key, message bodies, passwords or decision tokens; recipients are masked.

## Sender and store address (store settings)

*Beállítások → Áruház beállításai → E-mail küldés*, admin-only (the public settings read never returns them):

- **Kapcsolati e-mail** (`storeContactEmail`): receives contact-form messages and new-order notifications. The visitor's address is only `replyTo`, never the sender. (Named `storeContactEmail` because `contactEmail` would share the `contact_email` column of the public *Kapcsolat → E-mail* field.)
- **Feladó** (`emailFrom`): `Webshop <rendeles@example.hu>` or `rendeles@example.hu`, validated on save. The domain must be **verified in Resend** (Domains); changing this field does not get around provider restrictions such as the testing restriction.

Both are read from the settings on every send, so a change applies immediately, without a redeploy. The email history keeps the sender and recipient each email was actually sent with; later changes do not rewrite it. A missing or invalid value is an actionable failure (the error names the setting), never simulated success: in `resend` mode without a sender every attempt fails and is retried with backoff until it is set. A store notification created while *Kapcsolati e-mail* is empty is stored with the placeholder recipient `nincs-beallitva` (never sent to), fails with an explanation, and is sent to the configured address once it exists.

Migration `20261116_205853_email_settings_in_store` imported the former `CONTACT_EMAIL` and `EMAIL_FROM` environment variables once into empty settings (without `CONTACT_EMAIL`, the former contact-form recipient). Configured settings are never overwritten, invalid values are skipped, and only the source is logged. The application no longer reads these variables; remove them from your environments after migrating.

## Setup

Local (`.env.local`, never committed):

```
EMAIL_MODE=log
```

Real delivery:

```
EMAIL_MODE=resend
RESEND_API_KEY=re_…
RESEND_WEBHOOK_SECRET=whsec_…
```

then set *Feladó* and *Kapcsolati e-mail* in the admin (see above).

On Vercel set them per environment (*Sensitive*), e.g. `log` for Preview and `resend` for Production, and register the webhook (see [deployment.md](deployment.md#vercel)).
