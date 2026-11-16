import 'server-only'

import { isEmailAddress, senderAddress } from '@/lib/email-address'
import type { StoreSettings } from '@/types/settings'

/**
 * Email delivery configuration. Transport secrets stay in server-only environment variables:
 *   EMAIL_MODE      log (default) | resend
 *   RESEND_API_KEY  Resend API key (resend mode)
 * The sender and the store recipient are admin-editable store settings (Áruház beállításai →
 * "Feladó", "Kapcsolati e-mail"), read on every send, so a change applies without a redeploy.
 * Nothing here may use a NEXT_PUBLIC_ prefix; the API key is never logged or returned.
 */
export type EmailConfig =
  | { mode: 'log'; from: string | null; contactEmail: string | null }
  | { mode: 'resend'; apiKey: string; from: string; contactEmail: string | null }
  | { mode: 'invalid'; problems: string[] }

type EmailSettings = Pick<StoreSettings, 'contactEmail' | 'emailFrom'>

/**
 * Placeholder recipient of a store notification created while "Kapcsolati e-mail" is not set. It is never
 * sent to: the job fails with an explanation and takes the configured address once it exists.
 */
export const UNSET_STORE_RECIPIENT: string = 'nincs-beallitva'

const FROM_SETTING: string = 'Áruház beállításai → Feladó (email_from)'
const CONTACT_SETTING: string = 'Áruház beállításai → Kapcsolati e-mail (contact_email)'

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

export function getEmailConfig(settings: EmailSettings): EmailConfig {
  const mode = env('EMAIL_MODE') || 'log'
  const contactEmail = settings.contactEmail?.trim() || null
  const from = settings.emailFrom?.trim() || null
  const problems: string[] = []
  if (contactEmail && !isEmailAddress(contactEmail)) problems.push(`${CONTACT_SETTING}: nem érvényes e-mail-cím.`)
  if (from && !senderAddress(from)) problems.push(`${FROM_SETTING}: érvénytelen formátum („Webshop <rendeles@example.hu>” vagy „rendeles@example.hu”).`)
  if (mode === 'log') return problems.length > 0 ? { mode: 'invalid', problems } : { mode: 'log', from, contactEmail }
  if (mode !== 'resend') return { mode: 'invalid', problems: [`Ismeretlen EMAIL_MODE érték: "${mode}" (log vagy resend lehet).`] }

  const apiKey = env('RESEND_API_KEY')
  if (!apiKey) problems.push('RESEND_API_KEY hiányzik (szerveroldali környezeti változó).')
  else if (!apiKey.startsWith('re_')) problems.push('RESEND_API_KEY formátuma érvénytelen (re_ előtaggal kezdődik).')
  if (!from) problems.push(`${FROM_SETTING} nincs megadva. Adjon meg egy, a Resendben ellenőrzött domainen lévő feladót.`)
  if (process.env.NEXT_PUBLIC_RESEND_API_KEY) problems.push('A Resend kulcs NEXT_PUBLIC_ előtaggal nem adható meg (a böngészőbe kerülne).')
  return problems.length > 0 || !from ? { mode: 'invalid', problems } : { mode: 'resend', apiKey, from, contactEmail }
}

/** Recipient of store notifications and contact-form messages ("Kapcsolati e-mail"), or the unset placeholder. */
export function getStoreRecipient(settings: EmailSettings): string {
  const address = settings.contactEmail?.trim()
  return address && isEmailAddress(address) ? address : UNSET_STORE_RECIPIENT
}

/** Actionable error for a store notification without a configured recipient. */
export const MISSING_STORE_RECIPIENT: string = `Nincs beállítva a bolti címzett: ${CONTACT_SETTING}. Adja meg; az e-mailt a rendszer automatikusan újrapróbálja, vagy küldje újra az E-mail előzményekből.`
