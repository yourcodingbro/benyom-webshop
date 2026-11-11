import 'server-only'

import { areDevToolsEnabled } from '@/config/runtime'
import { AppError } from '@/lib/errors'
import type { AuthorizationContext } from '@/types/auth'

export function isAdminOrSystem(auth: AuthorizationContext): boolean {
  return auth.kind === 'admin' || auth.kind === 'system'
}

export function assertAdminOrSystem(auth: AuthorizationContext): void {
  if (!isAdminOrSystem(auth)) throw new AppError('FORBIDDEN', 'Ehhez a művelethez adminisztrátori jogosultság szükséges.')
}

/**
 * Development tools act as a sample administrator. This is NOT authentication:
 * it only exists while dev tools are enabled, which is never in production.
 * Real admin access will come from Payload's authenticated `req.user`.
 */
export function getDevAdminAuthorization(): AuthorizationContext {
  if (!areDevToolsEnabled()) throw new AppError('FORBIDDEN', 'A fejlesztői eszközök nem érhetők el.')
  return { kind: 'admin', adminId: 'minta-admin' }
}

export const SCHEDULER_AUTH: AuthorizationContext = { kind: 'system', process: 'proposal-scheduler' }
