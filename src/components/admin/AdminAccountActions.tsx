'use client'

import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import type React from 'react'
import { useEffect, useState } from 'react'

import { ActionStatus, BusyButton } from '@/components/admin/BusyButton'
import { describeDelivery, type InvitationResponse } from '@/components/admin/InviteAdminForm'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { adminRequest } from '@/lib/admin-request'

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
  const { pending, run } = useAsyncAction()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [expired, setExpired] = useState<boolean>(false)
  const [reload, setReload] = useState<number>(0)

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
  }, [id, reload])

  if (!id || !doc?.mustChangePassword) return null
  const isSelf = user?.id !== undefined && String(user.id) === String(id)
  const expires = doc.temporaryPasswordExpiresAt ? new Date(doc.temporaryPasswordExpiresAt) : null

  const regenerate = (): void => {
    if (!window.confirm('Új ideiglenes jelszót generál és elküldi? Az előző ideiglenes jelszó azonnal érvénytelen lesz, és a felhasználó minden munkamenete lezárul.')) return
    void run('regenerate', async () => {
      setMessage(null)
      const { ok, body } = await adminRequest<InvitationResponse>(`/api/users/${id}/regenerate-temporary-password`, { method: 'POST' })
      setMessage(ok ? describeDelivery(body, 'regenerate') : { ok: false, text: body.error ?? 'A művelet nem sikerült; az előző ideiglenes jelszó érvényes maradt.' })
      // Show the new attempt in "Utolsó meghívó e-mail" too.
      setReload((value) => value + 1)
    })
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
        <BusyButton busy={pending === 'regenerate'} busyLabel="Új jelszó és küldés…" onClick={regenerate}>
          Új ideiglenes jelszó és újraküldés
        </BusyButton>
      )}
      <ActionStatus message={message} pendingText={pending ? 'Új ideiglenes jelszó generálása és küldése folyamatban…' : null} />
    </div>
  )
}
