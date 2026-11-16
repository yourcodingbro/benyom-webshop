'use client'

import type React from 'react'
import { useId, useState } from 'react'

import { ActionStatus, BusyButton } from '@/components/admin/BusyButton'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { adminPost } from '@/lib/admin-request'

export type InvitationResponse = { userId?: string; email?: string; expiresAt?: string; delivery?: 'sent' | 'simulated' | 'failed'; error?: string | null }

const panel: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginBottom: 20, maxWidth: 720 }

/**
 * Outcome of an invitation or a new temporary password, with the account and the email reported
 * separately: it never claims delivery that did not happen.
 */
export function describeDelivery(result: InvitationResponse, context: 'invite' | 'regenerate' = 'invite'): { ok: boolean; text: string } {
  const expires = result.expiresAt ? new Date(result.expiresAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }) : ''
  const account = context === 'invite' ? `Fiók: létrehozva (${result.email ?? ''}), az ideiglenes jelszó lejár: ${expires}.` : `Ideiglenes jelszó: új jelszó beállítva, az előző érvénytelen; lejár: ${expires}.`
  if (result.delivery === 'sent') return { ok: true, text: `${account}\nE-mail: a Resend átvette. A kézbesítés állapota az E-mail előzményekben látható.` }
  const recovery = 'Teendő: a hiba elhárítása után a felhasználónál válassza az „Új ideiglenes jelszó és újraküldés” műveletet.'
  if (result.delivery === 'simulated') return { ok: false, text: `${account}\nE-mail: NEM lett elküldve – naplózó mód (EMAIL_MODE=log), így a jelszót senki nem kapta meg.\n${recovery}` }
  return { ok: false, text: `${account}\nE-mail: NEM ment ki${result.error ? ` – ${result.error}` : ''}. A jelszót senki nem kapta meg.\n${recovery}` }
}

/** "Új admin meghívása" above the user list: e-mail only; the password is generated and emailed by the server. */
export function InviteAdminForm(): React.JSX.Element {
  const id = useId()
  const [email, setEmail] = useState<string>('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const { pending, run } = useAsyncAction()

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void run('invite', async () => {
      setMessage(null)
      setFieldError(null)
      const { ok, body } = await adminPost<InvitationResponse>('/api/users/invite', { email })
      if (!ok) {
        // Nothing was created: the typed address stays for correction.
        setFieldError(body.fieldErrors?.email ?? null)
        // A field error is announced at the field; repeat only other errors here.
        setMessage(body.fieldErrors?.email ? null : { ok: false, text: body.error ?? 'A meghívás nem sikerült; fiók nem jött létre.' })
        return
      }
      setEmail('')
      setMessage(describeDelivery(body, 'invite'))
    })
  }

  return (
    <form onSubmit={submit} style={panel} noValidate aria-busy={pending !== null || undefined}>
      <h3 style={{ marginTop: 0 }}>Új admin meghívása</h3>
      <p>A rendszer ideiglenes jelszót generál, és e-mailben elküldi. Az első bejelentkezéskor kötelező új jelszót megadni.</p>
      <label htmlFor={`${id}-email`} style={{ display: 'block', marginBottom: 4 }}>
        E-mail-cím
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="off"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${id}-error` : undefined}
          style={{ minWidth: 280 }}
        />
        <BusyButton type="submit" variant="primary" busy={pending === 'invite'} busyLabel="Fiók létrehozása és küldés…" disabled={!email}>
          Meghívás küldése
        </BusyButton>
      </div>
      {fieldError ? (
        <p id={`${id}-error`} role="alert" style={{ color: 'var(--theme-error-500)' }}>
          {fieldError}
        </p>
      ) : null}
      <ActionStatus message={message} pendingText={pending ? 'Fiók létrehozása és a meghívó küldése folyamatban…' : null} />
    </form>
  )
}
