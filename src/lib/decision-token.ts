import 'server-only'

import { getSiteUrl } from '@/config/runtime'
import { hmac } from '@/lib/crypto'
import type { EmailKind } from '@/types/proposal'

/**
 * Decision token for one proposal email, derived (HMAC with APP_SIGNING_SECRET) instead of random:
 * a retry renders exactly the same email, and the raw token never needs to be stored anywhere. Only
 * its SHA-256 hash is saved, and only after the provider accepted the email.
 */
export function decisionToken(proposalId: string, kind: EmailKind): string {
  return hmac(`decision-token:${proposalId}:${kind}`)
}

export function decisionUrl(token: string): string {
  return `${getSiteUrl()}/arvaltozas/${token}`
}

/** Replaces token-bearing decision links before content is stored or logged. */
export function redactDecisionLinks(value: string): string {
  return value.replace(/(https?:\/\/[^\s"'<>]*)?\/arvaltozas\/[A-Za-z0-9_-]+/g, '[döntési link – a naplóból eltávolítva]')
}
