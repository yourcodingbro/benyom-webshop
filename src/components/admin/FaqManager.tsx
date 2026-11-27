'use client'

import { useDocumentDrawer } from '@payloadcms/ui'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

import { ActionStatus, BusyButton } from '@/components/admin/BusyButton'
import { adminPost, adminRequest } from '@/lib/admin-request'

type FaqRecord = { id: number; question: string; published?: boolean | null; _order?: string | null }

type FaqListResponse = { docs: FaqRecord[] }

type FaqRowProps = {
  faq: FaqRecord
  index: number
  count: number
  busy: boolean
  onSaved: () => void
  onMove: (index: number, direction: -1 | 1) => void
}

const API = '/api/faqs'

/** One entry: question, publication state, edit in Payload's document drawer, move up/down. */
function FaqRow(props: FaqRowProps): React.JSX.Element {
  const [Drawer, , drawer] = useDocumentDrawer({ collectionSlug: 'faqs', id: props.faq.id })
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--theme-elevation-100)' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>{props.faq.question}</strong>
        {props.faq.published === false ? <span style={{ marginLeft: 8, color: 'var(--theme-elevation-500)' }}>(rejtett)</span> : null}
      </span>
      <BusyButton busy={false} busyLabel="" size="small" blocked={props.busy} disabled={props.index === 0} onClick={() => props.onMove(props.index, -1)}>
        <span aria-hidden="true">↑</span>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Feljebb: {props.faq.question}
        </span>
      </BusyButton>
      <BusyButton busy={false} busyLabel="" size="small" blocked={props.busy} disabled={props.index === props.count - 1} onClick={() => props.onMove(props.index, 1)}>
        <span aria-hidden="true">↓</span>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Lejjebb: {props.faq.question}</span>
      </BusyButton>
      <BusyButton busy={false} busyLabel="" size="small" blocked={props.busy} onClick={drawer.openDrawer}>
        Szerkesztés
      </BusyButton>
      <Drawer onSave={props.onSaved} onDelete={props.onSaved} />
    </li>
  )
}

/**
 * Áruház beállítások → GYIK: the entries of the faqs collection (the single source of /gyik), in their stored order.
 * Creating and editing use Payload's own document drawer (it works although the collection has no sidebar entry);
 * moving uses Payload's reorder endpoint, the same one its drag-and-drop list uses, so there is one order only.
 */
export function FaqManager(): React.JSX.Element {
  const [faqs, setFaqs] = useState<FaqRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [CreateDrawer, , createDrawer] = useDocumentDrawer({ collectionSlug: 'faqs' })

  const load = useCallback(async (): Promise<void> => {
    const { ok, body } = await adminRequest<FaqListResponse>(`${API}?sort=_order&limit=200&depth=0&draft=false`)
    if (ok && Array.isArray(body.docs)) {
      setFaqs(body.docs)
      setError(null)
    } else setError(body.error ?? 'A GYIK-kérdések betöltése nem sikerült.')
  }, [])

  useEffect(() => {
    // One-time load of the entries when the tab opens (the list is not part of the global's form state).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load()
  }, [load])

  const move = async (index: number, direction: -1 | 1): Promise<void> => {
    if (!faqs) return
    const moved = faqs[index]
    const neighbour = faqs[index + direction]
    if (!moved || !neighbour) return
    setBusy(true)
    // Place the entry just after (moving down) or just before (moving up) its neighbour.
    const { ok, body } = await adminPost<{ success?: boolean }>('/api/reorder', {
      collectionSlug: 'faqs',
      docsToMove: [moved.id],
      newKeyWillBe: direction === 1 ? 'greater' : 'less',
      orderableFieldName: '_order',
      target: { id: neighbour.id, key: neighbour._order },
    })
    if (!ok) setError(body.error ?? 'Az átrendezés nem sikerült. Próbálja újra.')
    await load()
    setBusy(false)
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ color: 'var(--theme-elevation-600)' }}>
        A /gyik oldal kérdései ebben a sorrendben jelennek meg. A rejtett kérdések nem látszanak az oldalon. A kérdés
        szövegét, válaszát és a „Megjelenik” kapcsolót a Szerkesztés gombbal módosíthatja; a módosítás a kérdés saját
        mentésével azonnal érvényes, ehhez nem kell a beállítások lapot menteni.
      </p>
      <ActionStatus message={error ? { ok: false, text: error } : null} pendingText={busy ? 'Átrendezés…' : null} />
      {faqs === null && !error ? <p role="status">GYIK-kérdések betöltése…</p> : null}
      {faqs && faqs.length === 0 ? <p>Még nincs kérdés.</p> : null}
      {faqs && faqs.length > 0 ? (
        <ol aria-label="GYIK-kérdések" aria-busy={busy || undefined} style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
          {faqs.map((faq: FaqRecord, index: number) => (
            <FaqRow key={faq.id} faq={faq} index={index} count={faqs.length} busy={busy} onSaved={() => void load()} onMove={(at, direction) => void move(at, direction)} />
          ))}
        </ol>
      ) : null}
      <BusyButton busy={false} busyLabel="" blocked={busy} onClick={createDrawer.openDrawer}>
        Új kérdés
      </BusyButton>
      <CreateDrawer onSave={() => void load()} />
    </div>
  )
}
