import { vi } from 'vitest'

/**
 * Resend SDK test double: no network and no real email. `send` decides what the provider returns;
 * by default every email is accepted with a unique id. Webhook verification uses the real SDK.
 */
export const send = vi.fn()

let counter = 0

export function acceptAll(): void {
  send.mockReset()
  send.mockImplementation(async () => {
    counter += 1
    return { data: { id: `re_msg_${counter}` }, error: null }
  })
}

/** The next `count` sends fail with a transient provider error (5xx), then sends are accepted again. */
export function failNext(count: number): void {
  for (let index = 0; index < count; index += 1) {
    send.mockImplementationOnce(async () => ({ data: null, error: { name: 'application_error', message: 'Átmeneti hiba', statusCode: 500 } }))
  }
}

type ResendModule = { Resend: new (apiKey?: string) => { emails: unknown } }

export function mockResendModule(actual: ResendModule): ResendModule {
  class MockResend extends actual.Resend {
    constructor(apiKey?: string) {
      super(apiKey)
      ;(this as { emails: unknown }).emails = { send }
    }
  }
  return { ...actual, Resend: MockResend }
}
