'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import type React from 'react'
import { useEffect, useState } from 'react'

type EmailDocResponse = { previewHtml?: string | null; status?: string; isDemo?: boolean | null; lastError?: string | null }

/**
 * Email detail: the stored snapshot of the rendered React Email content (decision links already
 * redacted) in a fully sandboxed iframe, plus a safe retry for failed jobs (same idempotency key).
 */
export function EmailPreview(): React.JSX.Element | null {
  const { id } = useDocumentInfo()
  const [doc, setDoc] = useState<EmailDocResponse | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)

  useEffect(() => {
    if (!id) return
    void fetch(`/api/email-messages/${id}?depth=0`, { credentials: 'include' })
      .then((response: Response) => (response.ok ? (response.json() as Promise<EmailDocResponse>) : null))
      .then(setDoc)
  }, [id])

  if (!id || !doc) return null

  const retry = async (): Promise<void> => {
    if (!window.confirm('Újraküldi ezt az e-mailt? Ugyanazzal az idempotencia-kulccsal próbáljuk, így a már átvett e-mail nem duplikálódik.')) return
    setBusy(true)
    const response = await fetch(`/api/email-messages/${id}/retry`, { method: 'POST', credentials: 'include' })
    const body = (await response.json().catch(() => ({}))) as { status?: string; error?: string }
    setBusy(false)
    setMessage(response.ok ? `Új állapot: ${body.status ?? 'ismeretlen'}.` : (body.error ?? 'Az újraküldés nem sikerült.'))
    if (response.ok) window.setTimeout(() => window.location.reload(), 1200)
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {(doc.status === 'failed' || doc.status === 'queued') && !doc.isDemo ? (
        <p>
          <button type="button" className="btn btn--style-primary btn--size-medium" disabled={busy} onClick={retry}>
            Újraküldés
          </button>{' '}
          {message ? <span role="status">{message}</span> : null}
        </p>
      ) : null}
      {doc.previewHtml ? (
        <iframe title="E-mail előnézet (pillanatkép)" sandbox="" srcDoc={doc.previewHtml} style={{ width: '100%', height: 600, border: '1px solid var(--theme-elevation-150)', borderRadius: 8, background: '#fff' }} />
      ) : (
        <p>Ehhez az e-mailhez még nincs tartalom-pillanatkép (nem történt küldési kísérlet, vagy kihagyásra került).</p>
      )}
    </div>
  )
}
