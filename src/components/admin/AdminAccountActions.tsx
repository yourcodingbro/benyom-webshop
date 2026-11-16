'use client'

import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import type React from 'react'
import { useEffect, useState } from 'react'

import { describeDelivery } from '@/components/admin/InviteAdminForm'

type UserDoc = { email?: string; mustChangePassword?: boolean | null; temporaryPasswordExpiresAt?: string | null; lastInvitationEmail?: number | { id: number } | null }
type EmailDoc = { status?: string; lastError?: string | null; skipReason?: string | null }

const STATUS_TEXT: Record<string, string> = {
  queued: 'sorban áll',
  submitted: 'a Resend átvette (kézbesítés még nincs visszaigazolva)',
  delivered: 'kézbesítve',
  failed: 'sikertelen',
  bounced: 'visszapattant',
  suppressed: 'letiltott címzett',
  cancelled: 'megszakítva',
  simulated: 'naplózó mód – nem lett elküldve',
}

/**
 * Account status in the user's edit view and the "Új ideiglenes jelszó és újraküldés" action. Shows the
 * real state of the last invitation email; the server enforces every rule.
 */
export function AdminAccountActions(): React.JSX.Element | null {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const [doc, setDoc] = useState<UserDoc | null>(null)
  const [email, setEmail] = useState<EmailDoc | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [expired, setExpired] = useState<boolean>(false)

  useEffect(() => {
    if (!id) return
    let active = true
    void fetch(`/api/users/${id}?depth=0`, { credentials: 'include' })
      .then((response: Response) => (response.ok ? (response.json() as Promise<UserDoc>) : null))
      .then(async (userDoc: UserDoc | null) => {
        if (!active || !userDoc) return
        setDoc(userDoc)
        setExpired(Boolean(userDoc.temporaryPasswordExpiresAt && new Date(userDoc.temporaryPasswordExpiresAt).getTime() <= Date.now()))
        const emailId = typeof userDoc.lastInvitationEmail === 'object' ? userDoc.lastInvitationEmail?.id : userDoc.lastInvitationEmail
        if (!emailId) return
        const response = await fetch(`/api/email-messages/${emailId}?depth=0`, { credentials: 'include' })
        if (active && response.ok) setEmail((await response.json()) as EmailDoc)
      })
    return () => {
      active = false
    }
  }, [id])

  if (!id || !doc?.mustChangePassword) return null
  const isSelf = user?.id !== undefined && String(user.id) === String(id)
  const expires = doc.temporaryPasswordExpiresAt ? new Date(doc.temporaryPasswordExpiresAt) : null

  const regenerate = async (): Promise<void> => {
    if (!window.confirm('Új ideiglenes jelszót generál és elküldi? Az előző ideiglenes jelszó azonnal érvénytelen lesz, és a felhasználó minden munkamenete lezárul.')) return
    setBusy(true)
    const response = await fetch(`/api/users/${id}/regenerate-temporary-password`, { method: 'POST', credentials: 'include' })
    const body = ((await response.json().catch(() => ({}))) ?? {}) as Parameters<typeof describeDelivery>[0] & { error?: string }
    setBusy(false)
    setMessage(response.ok ? describeDelivery(body) : { ok: false, text: body.error ?? 'A művelet nem sikerült.' })
  }

  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Ideiglenes jelszó</h3>
      <p>
        A felhasználó még nem állított be saját jelszót. Ideiglenes jelszó lejárata: {expires ? expires.toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }) : '–'}
        {expired ? ' (lejárt)' : ''}.
      </p>
      <p>
        Utolsó meghívó e-mail: {email?.status ? (STATUS_TEXT[email.status] ?? email.status) : 'nincs adat'}
        {email?.lastError ? ` – ${email.lastError}` : ''}
      </p>
      {isSelf ? null : (
        <button type="button" className="btn btn--style-secondary btn--size-medium" disabled={busy} onClick={regenerate}>
          Új ideiglenes jelszó és újraküldés
        </button>
      )}
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} style={{ color: message.ok ? 'var(--theme-success-500)' : 'var(--theme-error-500)' }}>
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
