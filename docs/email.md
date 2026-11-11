# Email

## Current implementation (logging only)

`src/services/emailService.ts` (server-only):

```ts
type EmailService = { sendEmail: (input: SendEmailInput) => Promise<SendEmailResult> }
// SendEmailInput  = { to, template: EmailTemplate, settings, orderReference, proposalId }
// SendEmailResult = { status: 'sent_simulated', messageId, sentAt } | { status: 'failed', attemptedAt, error }
```

`sendEmail` never throws on delivery problems. Failures are returned so callers can record and retry them. Behavior:
1. Renders the Hungarian template (`src/emails/`) to subject, HTML and text.
2. Applies controlled failure simulation (`/fejlesztes`: next send fails / all fail).
3. Logs `[EMAIL – SZIMULÁLT, NEM KÜLDÖTT]` with status, recipient, subject, template id, order reference and proposal id. It does **not** log bodies, links, tokens or addresses. `redactForLog()` strips URLs and long tokens from logged text as a safety net.
4. Stores an email-log entry. The rendered HTML/text preview is kept **only while dev tools are enabled** and is viewable at `/fejlesztes/email/{id}` (sandboxed iframe). Previews contain working sample decision links by design and are unreachable in production.
5. Returns explicit simulated success with a timestamp.

No email SDK is installed, no client is created, and no API is called. A test asserts that `resend`/`nodemailer` are absent and that `emailService.sendEmail(` is called only from `notificationService`.

`notificationService.notify()` picks the recipient (customer or store) and appends a `NotificationRecord` (template, status, times, error) to the order.

## Templates (`src/emails/`)

| id | When |
| --- | --- |
| `order-received` | after submission (customer) |
| `store-new-order` | after submission (store address from settings) |
| `price-change-proposal` | proposal created / retried |
| `price-change-reminder` | 24 h after successful proposal email |
| `price-change-accepted` | customer accepted |
| `cancelled-after-rejection` | customer rejected |
| `cancelled-after-timeout` | final deadline passed |
| `cancelled-by-store` | admin cancellation |
| `fulfillment-update` | confirmed, ready for collection, dispatched, completed |

All templates explain that this is a preorder with payment on collection or delivery. Proposal and reminder emails show old/new prices and totals, what acceptance means, that rejection cancels the **entire** order, the response deadline, and that the final timeout cancels the order. Links open a decision page; nothing changes on click.

## Future Resend integration (not implemented)

1. `npm install resend` and add `RESEND_API_KEY` and `EMAIL_FROM` (server-only env vars).
2. Verify the sender domain in Resend (SPF, DKIM; DMARC recommended).
3. Replace only the body of `emailService.sendEmail`: call `resend.emails.send({ from, to, subject, html, text, headers: { 'Idempotency-Key': … } })`. Map success to `{ status: 'sent', sentAt }` (rename the status union) and errors to `{ status: 'failed' }`. Keep the same logging rules.
4. **Durable delivery**: add a persisted outbox (e.g. a Payload `notifications` collection). Write the outbox row in the same transaction as the order or proposal change, and let an authenticated job send it with retries and backoff. `sentAt` becomes the provider acceptance time, which starts the proposal periods.
5. Handle Resend webhooks (`email.bounced`, `email.complained`, `email.delivery_delayed`) on an authenticated route. Mark the notification, and flag orders whose proposal emails keep failing so staff contact the customer.
6. Remove preview storage, or keep it only in non-production.
