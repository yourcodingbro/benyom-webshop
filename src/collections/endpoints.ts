import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'

import { isAdminRequest } from '@/collections/access'
import type { AuthorizationContext } from '@/types/auth'

/*
 * Custom admin endpoints (mounted under /api/<collection>/…). Every handler requires an authenticated
 * admin (`req.user`), validates input server-side and delegates to the existing services, which own
 * the business rules. Services are imported lazily so the Payload CLI (migrations, import script)
 * never loads server-only modules.
 */

type JsonBody = Record<string, unknown>

function adminAuth(req: PayloadRequest): AuthorizationContext | null {
  if (!isAdminRequest(req) || !req.user) return null
  const email = 'email' in req.user && typeof req.user.email === 'string' ? req.user.email : 'admin'
  return { kind: 'admin', adminId: String(req.user.id), label: email }
}

const forbidden = (): Response => Response.json({ error: 'Ehhez a művelethez adminisztrátori bejelentkezés szükséges.' }, { status: 403 })

async function readJson(req: PayloadRequest): Promise<JsonBody> {
  await addDataAndFileToRequest(req)
  return req.data && typeof req.data === 'object' ? (req.data as JsonBody) : {}
}

/** Maps service errors to Hungarian, actionable JSON responses; unexpected errors are not leaked. */
async function respond(work: () => Promise<unknown>): Promise<Response> {
  const { isAppError } = await import('@/lib/errors')
  try {
    return Response.json(await work())
  } catch (error: unknown) {
    if (isAppError(error)) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' || error.code === 'INVALID_STATE' ? 409 : 400
      return Response.json({ error: error.message, fieldErrors: error.fieldErrors ?? null }, { status })
    }
    console.error('[ADMIN VÉGPONT HIBA]', error instanceof Error ? error.name : 'ismeretlen')
    return Response.json({ error: 'Váratlan hiba történt. Próbálja újra; ha ismétlődik, nézze meg a szervernaplót.' }, { status: 500 })
  }
}

function idParam(req: PayloadRequest): string {
  return String(req.routeParams?.id ?? '')
}

export const orderEndpoints: Endpoint[] = [
  {
    path: '/:id/cancel',
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      const auth = adminAuth(req)
      if (!auth) return forbidden()
      const body = await readJson(req)
      const { orderService } = await import('@/services/orderService')
      return respond(async () => {
        const order = await orderService.cancelOrder({ orderId: idParam(req), note: String(body.reason ?? ''), expectedVersion: Number(body.version) }, auth)
        return { ok: true, reference: order.reference }
      })
    },
  },
  {
    path: '/:id/price-change',
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      const auth = adminAuth(req)
      if (!auth) return forbidden()
      const body = await readJson(req)
      const { priceChangeService } = await import('@/services/priceChangeService')
      return respond(async () => {
        const input = { ...body, orderId: idParam(req) }
        // `review: true` computes the proposal (prices, totals) without saving or sending anything.
        if (body.review === true) return { ok: true, review: await priceChangeService.reviewProposal(input, auth) }
        const proposal = await priceChangeService.createProposal(input, auth)
        return { ok: true, proposalId: proposal.id, sentAt: proposal.proposalEmail.sentAt, lastError: proposal.proposalEmail.lastError }
      })
    },
  },
]

export const emailEndpoints: Endpoint[] = [
  {
    path: '/:id/retry',
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      const auth = adminAuth(req)
      if (!auth) return forbidden()
      const { emailService } = await import('@/services/emailService')
      return respond(async () => ({ ok: true, status: await emailService.retry(Number(idParam(req)), auth) }))
    },
  },
]

export const importJobEndpoints: Endpoint[] = [
  {
    path: '/preview',
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      const auth = adminAuth(req)
      if (!auth) return forbidden()
      await addDataAndFileToRequest(req)
      const { importService, MAX_CSV_BYTES } = await import('@/services/importService')
      const file = req.file
      if (!file) return Response.json({ error: 'Válasszon CSV-fájlt.' }, { status: 400 })
      if (file.size > MAX_CSV_BYTES) return Response.json({ error: 'A fájl túl nagy (legfeljebb 1 MB).' }, { status: 400 })
      return respond(async () => importService.createJob(file.name, file.data.toString('utf8'), auth))
    },
  },
  {
    path: '/:id/run',
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      const auth = adminAuth(req)
      if (!auth) return forbidden()
      const { importService } = await import('@/services/importService')
      return respond(async () => importService.runJob(Number(idParam(req)), auth))
    },
  },
]
