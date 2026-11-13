import { isAppError } from '@/lib/errors'
import { emailService } from '@/services/emailService'

export const dynamic = 'force-dynamic'

/**
 * Resend delivery webhooks (email.delivered, email.bounced, …). The Svix signature is verified over the
 * raw body; duplicates (same svix-id) and out-of-order events are handled in the email DTO.
 * Answers 2xx for every verified event so Resend does not retry processed or irrelevant events.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  try {
    const result = await emailService.handleWebhook(rawBody, {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    })
    return Response.json({ ok: true, result })
  } catch (error: unknown) {
    if (isAppError(error) && error.code === 'FORBIDDEN') return Response.json({ error: 'Érvénytelen aláírás.' }, { status: 401 })
    if (isAppError(error) && error.code === 'UNAVAILABLE') return Response.json({ error: error.message }, { status: 503 })
    console.error('[RESEND WEBHOOK HIBA]', error instanceof Error ? error.name : 'ismeretlen')
    // 5xx: Resend retries later; nothing was applied (the transaction rolled back).
    return Response.json({ error: 'Feldolgozási hiba.' }, { status: 500 })
  }
}
