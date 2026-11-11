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
