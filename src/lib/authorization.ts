import 'server-only'

import { AppError } from '@/lib/errors'
import type { AuthorizationContext } from '@/types/auth'

export function isAdminOrSystem(auth: AuthorizationContext): boolean {
  return auth.kind === 'admin' || auth.kind === 'system'
}

export function assertAdminOrSystem(auth: AuthorizationContext): void {
  if (!isAdminOrSystem(auth)) throw new AppError('FORBIDDEN', 'Ehhez a művelethez adminisztrátori jogosultság szükséges.')
}

export const SCHEDULER_AUTH: AuthorizationContext = { kind: 'system', process: 'proposal-scheduler' }
