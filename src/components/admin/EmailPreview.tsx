'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import type React from 'react'
import { useEffect, useState } from 'react'

import { ActionStatus, BusyButton } from '@/components/admin/BusyButton'
import { EMAIL_STATUS_LABELS } from '@/config/labels'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { adminRequest } from '@/lib/admin-request'

type EmailDocResponse = { previewHtml?: string | null; status?: string; isDemo?: boolean | null; lastError?: string | null; nextAttemptAt?: string | null }

/** What a retry result means for the admin; "busy" = another worker is sending it right now. */
function describeRetry(status: string | undefined, lastError: string | null | undefined): { ok: boolean; text: string } {
  if (status === 'busy') return { ok: true, text: 'Feldolgozás alatt: egy másik folyamat éppen küldi ezt az e-mailt. Frissítse később az oldalt.' }
  if (status === 'submitted' || status === 'delivered') return { ok: true, text: `${EMAIL_STATUS_LABELS[status]}: a Resend átvette az e-mailt. A kézbesítést a webhook igazolja.` }
  if (status === 'simulated') return { ok: false, text: 'Naplózó mód (EMAIL_MODE=log): az e-mail nem lett elküldve.' }
  if (status === 'queued') return { ok: true, text: 'Sorban áll: a háttérfolyamat (ütemező) küldi el a következő futáskor.' }
  return { ok: false, text: `${EMAIL_STATUS_LABELS[status ?? ''] ?? 'Sikertelen'}${lastError ? `: ${lastError}` : '.'}` }
}

/**
 * Email detail: the stored snapshot of the rendered React Email content (decision links already
 * redacted) in a fully sandboxed iframe, plus a safe retry for failed jobs (same idempotency key).
 */
export function EmailPreview(): React.JSX.Element | null {
  const { id } = useDocumentInfo()
  const [doc, setDoc] = useState<EmailDocResponse | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const { pending, run } = useAsyncAction()

  useEffect(() => {
    if (!id) return
    void adminRequest<EmailDocResponse>(`/api/email-messages/${id}?depth=0`).then(({ ok, body }) => setDoc(ok ? body : null))
  }, [id])

  if (!id || !doc) return null

  const retry = (): void => {
    if (!window.confirm('Újraküldi ezt az e-mailt? Ugyanazzal az idempotencia-kulccsal próbáljuk, így a már átvett e-mail nem duplikálódik.')) return
    void run('retry', async () => {
      setMessage(null)
      const result = await adminRequest<{ status: string }>(`/api/email-messages/${id}/retry`, { method: 'POST' })
      if (!result.ok) {
        setMessage({ ok: false, text: result.body.error ?? 'Az újraküldés nem sikerült.' })
        return
      }
      // The stored job is the source of truth (status, sanitized error).
      const fresh = await adminRequest<EmailDocResponse>(`/api/email-messages/${id}?depth=0`)
      if (fresh.ok) setDoc(fresh.body)
      setMessage(describeRetry(result.body.status, fresh.body.lastError))
    })
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {doc.status ? (
        <p>
          <strong>Állapot:</strong> {EMAIL_STATUS_LABELS[doc.status] ?? doc.status}
          {doc.status === 'queued' ? ' – a háttérfolyamat küldi' : ''}
          {doc.status === 'failed' && !doc.nextAttemptAt ? ' – automatikus újrapróbálás nincs (végleges hiba)' : ''}
          {doc.status === 'failed' && doc.nextAttemptAt ? ` – automatikus újrapróbálás: ${new Date(doc.nextAttemptAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}` : ''}
        </p>
      ) : null}
      {(doc.status === 'failed' || doc.status === 'queued') && !doc.isDemo ? (
        <div style={{ marginBottom: 16 }}>
          <BusyButton variant="primary" busy={pending === 'retry'} busyLabel="Küldés…" onClick={retry}>
            Újraküldés
          </BusyButton>
          <ActionStatus message={message} pendingText={pending ? 'Az e-mail újraküldése folyamatban…' : null} />
        </div>
      ) : (
        <ActionStatus message={message} />
      )}
      {doc.previewHtml ? (
        <iframe title="E-mail előnézet (pillanatkép)" sandbox="" srcDoc={doc.previewHtml} style={{ width: '100%', height: 600, border: '1px solid var(--theme-elevation-150)', borderRadius: 8, background: '#fff' }} />
      ) : (
        <p>Ehhez az e-mailhez még nincs tartalom-pillanatkép (nem történt küldési kísérlet, vagy kihagyásra került).</p>
      )}
    </div>
  )
}
