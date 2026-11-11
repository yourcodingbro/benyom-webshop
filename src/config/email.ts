import 'server-only'

import { z } from 'zod'

import type { StoreSettings } from '@/types/settings'

/**
 * Email delivery configuration, read lazily from server-only environment variables:
 *   EMAIL_MODE      log (default) | resend
 *   RESEND_API_KEY  Resend API key (resend mode)
 *   EMAIL_FROM      verified sender, e.g. "Webshop <rendeles@example.com>" (resend mode)
 *   CONTACT_EMAIL   store notification + contact-form recipient (required in resend mode)
 * None of these may use a NEXT_PUBLIC_ prefix; the API key is never logged or returned.
 */
export type EmailConfig =
  | { mode: 'log'; contactEmail: string | null }
  | { mode: 'resend'; apiKey: string; from: string; contactEmail: string }
  | { mode: 'invalid'; problems: string[] }

const emailAddress = z.email()
/** "Name <address>" or a bare address. */
const SENDER_PATTERN: RegExp = /^(?:[^<>]{1,100}<([^<>\s]+)>|([^<>\s]+))$/

function senderAddress(value: string): string | null {
  const match = SENDER_PATTERN.exec(value.trim())
  const address = match?.[1] ?? match?.[2] ?? null
  return address && emailAddress.safeParse(address).success ? address : null
}

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

export function getEmailConfig(): EmailConfig {
  const mode = env('EMAIL_MODE') || 'log'
  const contactRaw = env('CONTACT_EMAIL')
  const contactValid = contactRaw === '' || emailAddress.safeParse(contactRaw).success
  if (mode === 'log') {
    return contactValid ? { mode: 'log', contactEmail: contactRaw || null } : { mode: 'invalid', problems: ['CONTACT_EMAIL nem érvényes e-mail-cím.'] }
  }
  if (mode !== 'resend') return { mode: 'invalid', problems: [`Ismeretlen EMAIL_MODE érték: "${mode}" (log vagy resend lehet).`] }

  const apiKey = env('RESEND_API_KEY')
  const from = env('EMAIL_FROM')
  const problems: string[] = []
  if (!apiKey) problems.push('RESEND_API_KEY hiányzik.')
  else if (!apiKey.startsWith('re_')) problems.push('RESEND_API_KEY formátuma érvénytelen (re_ előtaggal kezdődik).')
  if (!from) problems.push('EMAIL_FROM hiányzik.')
  else if (!senderAddress(from)) problems.push('EMAIL_FROM formátuma érvénytelen ("Név <cim@domain.hu>" vagy "cim@domain.hu").')
  if (!contactRaw) problems.push('CONTACT_EMAIL hiányzik.')
  else if (!contactValid) problems.push('CONTACT_EMAIL nem érvényes e-mail-cím.')
  if (process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.NEXT_PUBLIC_EMAIL_FROM || process.env.NEXT_PUBLIC_CONTACT_EMAIL) {
    problems.push('E-mail beállítás NEXT_PUBLIC_ előtaggal nem adható meg (a böngészőbe kerülne).')
  }
  return problems.length > 0 ? { mode: 'invalid', problems } : { mode: 'resend', apiKey, from, contactEmail: contactRaw }
}

/**
 * Recipient of store notifications and contact-form messages: CONTACT_EMAIL when set,
 * otherwise (log mode only) the sample settings address. Resend mode always requires CONTACT_EMAIL.
 */
export function getStoreRecipient(settings: StoreSettings, purpose: 'orders' | 'contact'): string {
  const config = getEmailConfig()
  if (config.mode !== 'invalid' && config.contactEmail) return config.contactEmail
  return purpose === 'contact' ? settings.contactRecipientEmail : settings.storeNotificationEmail
}
