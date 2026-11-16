'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useId, useState } from 'react'

import { BusyButton } from '@/components/admin/BusyButton'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { adminPost } from '@/lib/admin-request'
import { checkPasswordPolicy, PASSWORD_MIN_LENGTH } from '@/lib/password-policy'

type ChangePasswordFormProps = {
  email: string
}

type ServerErrors = { password?: string; confirmPassword?: string; form?: string }

const field: React.CSSProperties = { display: 'block', width: '100%', maxWidth: 420 }

/**
 * New password + confirmation with Hungarian, screen-reader-announced validation. The rules are checked
 * here for immediate feedback and again on the server (strength, confirmation, no reuse of the
 * temporary password). On success every session ends and the user signs in with the new password.
 */
export function ChangePasswordForm(props: ChangePasswordFormProps): React.JSX.Element {
  const id = useId()
  const router = useRouter()
  const [password, setPassword] = useState<string>('')
  const [confirmation, setConfirmation] = useState<string>('')
  const [submitted, setSubmitted] = useState<boolean>(false)
  const [serverErrors, setServerErrors] = useState<ServerErrors>({})
  const { pending, run } = useAsyncAction()
  const [done, setDone] = useState<boolean>(false)

  const problems = checkPasswordPolicy({ password, confirmation, email: props.email })
  const passwordError = serverErrors.password ?? (submitted && problems.password.length ? problems.password.join(' ') : null)
  const confirmationError = serverErrors.confirmPassword ?? (submitted && problems.confirmation ? problems.confirmation : null)

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSubmitted(true)
    setServerErrors({})
    if (problems.password.length || problems.confirmation) {
      document.getElementById(problems.password.length ? `${id}-password` : `${id}-confirm`)?.focus()
      return
    }
    await run('save', async () => {
      const { ok, body } = await adminPost<{ ok: boolean }>('/api/users/change-temporary-password', { password, confirmPassword: confirmation })
      if (!ok) {
        // The typed passwords stay in the fields for correction.
        setServerErrors({ ...(body.fieldErrors ?? {}), form: body.error ?? 'A jelszócsere nem sikerült.' })
        return
      }
      setDone(true)
      window.setTimeout(() => router.push('/admin/login'), 2500)
    })
  }

  if (done) {
    return (
      <p role="status">
        A jelszó módosítva. Biztonsági okból minden munkamenet lezárult; jelentkezzen be az új jelszóval. Átirányítás a bejelentkezéshez…
      </p>
    )
  }

  return (
    <form onSubmit={submit} noValidate style={{ maxWidth: 520 }}>
      <p>
        Ideiglenes jelszóval jelentkezett be. Más művelet csak az új jelszó beállítása után érhető el. Az új jelszó legalább {PASSWORD_MIN_LENGTH} karakter, legalább háromféle karaktert tartalmaz (kisbetű, nagybetű, szám, írásjel), és nem egyezhet az ideiglenes jelszóval.
      </p>
      {serverErrors.form ? (
        <p role="alert" style={{ color: 'var(--theme-error-500)' }}>
          {serverErrors.form}
        </p>
      ) : null}
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${id}-password`}>Új jelszó</label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={`${id}-password-help${passwordError ? ` ${id}-password-error` : ''}`}
          style={field}
        />
        <small id={`${id}-password-help`}>Legalább {PASSWORD_MIN_LENGTH} karakter.</small>
        {passwordError ? (
          <p id={`${id}-password-error`} role="alert" style={{ color: 'var(--theme-error-500)', margin: '4px 0 0' }}>
            {passwordError}
          </p>
        ) : null}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${id}-confirm`}>Új jelszó megerősítése</label>
        <input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={confirmationError ? true : undefined}
          aria-describedby={confirmationError ? `${id}-confirm-error` : undefined}
          style={field}
        />
        {confirmationError ? (
          <p id={`${id}-confirm-error`} role="alert" style={{ color: 'var(--theme-error-500)', margin: '4px 0 0' }}>
            {confirmationError}
          </p>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <BusyButton type="submit" variant="primary" busy={pending === 'save'} busyLabel="Mentés…">
          Jelszó mentése
        </BusyButton>
        <Link href="/admin/logout">Kijelentkezés</Link>
      </div>
    </form>
  )
}
