'use client'

import type React from 'react'
import { useId, useState } from 'react'

type InvitationResponse = { userId?: string; email?: string; expiresAt?: string; delivery?: 'sent' | 'simulated' | 'failed'; error?: string | null; fieldErrors?: Record<string, string> | null }

const panel: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginBottom: 20, maxWidth: 720 }

/** Text shown after an invitation: never claims delivery that did not happen. */
export function describeDelivery(result: InvitationResponse): { ok: boolean; text: string } {
  const expires = result.expiresAt ? new Date(result.expiresAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }) : ''
  if (result.delivery === 'sent') return { ok: true, text: `Az ideiglenes jelszót tartalmazó e-mailt a Resend átvette (${result.email}). Lejárat: ${expires}. A kézbesítés állapota az E-mail előzményekben látható.` }
  if (result.delivery === 'simulated') return { ok: false, text: `Naplózó mód (EMAIL_MODE=log): az e-mail NEM lett elküldve, így a meghívott nem kapta meg a jelszót. Éles küldéshez állítsa be a Resendet, majd generáljon új ideiglenes jelszót.` }
  return { ok: false, text: `Az e-mail küldése NEM sikerült${result.error ? `: ${result.error}` : ''}. A fiók létrejött, de a jelszót senki nem kapta meg: használja a felhasználónál az „Új ideiglenes jelszó és újraküldés” műveletet.` }
}

/** "Új admin meghívása" above the user list: e-mail only; the password is generated and emailed by the server. */
export function InviteAdminForm(): React.JSX.Element {
  const id = useId()
  const [email, setEmail] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setFieldError(null)
    const response = await fetch('/api/users/invite', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const body = ((await response.json().catch(() => ({}))) ?? {}) as InvitationResponse
    setBusy(false)
    if (!response.ok) {
      setFieldError(body.fieldErrors?.email ?? null)
      setMessage({ ok: false, text: body.error ?? 'A meghívás nem sikerült.' })
      return
    }
    setEmail('')
    setMessage(describeDelivery(body))
  }

  return (
    <form onSubmit={submit} style={panel} noValidate>
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
        <button type="submit" className="btn btn--style-primary btn--size-medium" disabled={busy || !email}>
          Meghívás küldése
        </button>
      </div>
      {fieldError ? (
        <p id={`${id}-error`} role="alert" style={{ color: 'var(--theme-error-500)' }}>
          {fieldError}
        </p>
      ) : null}
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} style={{ color: message.ok ? 'var(--theme-success-500)' : 'var(--theme-error-500)' }}>
          {message.text}
        </p>
      ) : null}
    </form>
  )
}
