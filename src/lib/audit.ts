import type { AuthorizationContext } from '@/types/auth'
import type { AuditActor } from '@/types/workflow'

/** Audit actor for a service call. Identities come from the server-side auth context, never from input. */
export function actorOf(auth: AuthorizationContext): AuditActor {
  switch (auth.kind) {
    case 'admin': {
      const userId = Number(auth.adminId)
      return { type: 'admin', userId: Number.isSafeInteger(userId) ? userId : null, label: auth.label ?? auth.adminId }
    }
    case 'system':
      return { type: 'system', label: auth.process }
    case 'order-access':
      return { type: 'customer', label: 'ügyfél' }
    case 'anonymous':
      return { type: 'customer', label: 'látogató' }
  }
}
