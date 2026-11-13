import 'server-only'

import { payloadClient } from '@/dto/payload'
import type { AuthorizationContext } from '@/types/auth'

/**
 * The signed-in Payload admin for a request (cookie or Authorization header), or null. Identity comes
 * only from Payload's verified session, never from request data.
 */
export async function getAdminAuthorization(headers: Headers): Promise<AuthorizationContext | null> {
  const payload = await payloadClient()
  const { user } = await payload.auth({ headers })
  if (!user || user.collection !== 'users' || !Array.isArray(user.roles) || !user.roles.includes('admin')) return null
  return { kind: 'admin', adminId: String(user.id), label: user.email }
}
