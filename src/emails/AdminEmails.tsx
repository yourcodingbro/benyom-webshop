import { Section, Text } from '@react-email/components'
import type React from 'react'

import { EmailLayout, Paragraph } from '@/emails/EmailLayout'
import { formatDateTime } from '@/lib/format'
import type { StoreSettings } from '@/types/settings'

type AdminInvitationEmailProps = {
  email: string
  temporaryPassword: string
  loginUrl: string
  expiresAt: string
  settings: StoreSettings
}

export function adminInvitationSubject(settings: StoreSettings): string {
  return `Adminisztrátori hozzáférés – ${settings.storeName}`
}

/**
 * Invitation with a one-time temporary password. The password is shown only in the delivered email;
 * the stored history snapshot has it redacted, and it must be changed at the first login.
 */
export function AdminInvitationEmail(props: AdminInvitationEmailProps): React.JSX.Element {
  return (
    <EmailLayout
      settings={props.settings}
      preview={adminInvitationSubject(props.settings)}
      heading="Adminisztrátori fiókot hoztak létre Önnek"
      action={{ label: 'Bejelentkezés az admin felületre', url: props.loginUrl }}
      closing={['Ha nem Ön kérte a hozzáférést, kérjük, jelezze a bolt üzemeltetőjének, és ne jelentkezzen be.']}
    >
      <Paragraph>Az alábbi ideiglenes adatokkal jelentkezhet be. Az első bejelentkezéskor új jelszót kell megadnia; addig más művelet nem érhető el.</Paragraph>
      <Section style={{ backgroundColor: '#f6f6f6', borderRadius: '8px', padding: '12px 16px', margin: '0 0 14px' }}>
        <Text style={{ margin: '0 0 6px', fontSize: '15px' }}>E-mail-cím: {props.email}</Text>
        <Text style={{ margin: 0, fontSize: '15px', fontFamily: 'monospace' }}>Ideiglenes jelszó: {props.temporaryPassword}</Text>
      </Section>
      <Paragraph>Az ideiglenes jelszó lejár: {formatDateTime(props.expiresAt)}. Lejárat után kérjen új ideiglenes jelszót egy adminisztrátortól.</Paragraph>
      <Paragraph>Bejelentkezési oldal: {props.loginUrl}</Paragraph>
    </EmailLayout>
  )
}
