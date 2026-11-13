/** Who is performing a data-access operation. Every protected DTO call receives one. */
export type AuthorizationContext =
  | { kind: 'admin'; adminId: string; label?: string }
  | { kind: 'system'; process: string }
  | { kind: 'order-access'; reference: string; accessToken: string }
  | { kind: 'anonymous' }
