export type AppErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FORBIDDEN' | 'UNAVAILABLE' | 'INVALID_STATE'

/** Application error with a stable code; messages are Hungarian and safe to show to users. */
export class AppError extends Error {
  readonly code: AppErrorCode
  readonly fieldErrors: Record<string, string> | null

  constructor(code: AppErrorCode, message: string, fieldErrors: Record<string, string> | null = null) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/** Postgres 23505, or Payload's ValidationError for a `unique` field (message is localized). */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const details = error as Error & { cause?: { code?: unknown } | unknown; data?: unknown }
  if (details.cause && typeof details.cause === 'object' && 'code' in details.cause && (details.cause as { code?: unknown }).code === '23505') return true
  const text = `${error.message} ${JSON.stringify(details.data ?? '')} ${String(details.cause ?? '')}`
  return /duplicate key|unique constraint|23505|egyedinek kell|must be unique|already exists/i.test(text)
}
