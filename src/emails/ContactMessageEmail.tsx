import { Section, Text } from '@react-email/components'
import type React from 'react'

import { EmailLayout, Paragraph } from '@/emails/EmailLayout'
import type { ContactMessage } from '@/types/contact'
import type { StoreSettings } from '@/types/settings'

type ContactMessageEmailProps = {
  message: ContactMessage
  settings: StoreSettings
}

export function contactSubject(message: ContactMessage): string {
  return `Kapcsolatfelvétel: ${message.subject}`
}

/** Store-facing notification. The visitor's address is only used as reply-to, never as sender. */
export function ContactMessageEmail(props: ContactMessageEmailProps): React.JSX.Element {
  const { message } = props
  return (
    <EmailLayout settings={props.settings} preview={contactSubject(message)} heading="Új üzenet a kapcsolati űrlapról">
      <Paragraph>
        Feladó: {message.name} ({message.email}) – a válasz erre a címre megy (Reply-To).
      </Paragraph>
      <Paragraph>Tárgy: {message.subject}</Paragraph>
      <Section style={{ backgroundColor: '#f6f6f6', borderRadius: '8px', padding: '12px 16px', margin: '0 0 14px' }}>
        <Text style={{ margin: 0, fontSize: '15px', lineHeight: '1.55', whiteSpace: 'pre-wrap' }}>{message.message}</Text>
      </Section>
      <Paragraph>Az adatkezelési tájékoztatót a feladó elfogadta ({message.privacyVersion}).</Paragraph>
    </EmailLayout>
  )
}
