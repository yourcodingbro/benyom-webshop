'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import type React from 'react'
import { useEffect, useState } from 'react'

type OrderLine = { lineId: string; productName: string; sku: string; quantity: number; unitPrice: number }

type OrderSummary = {
  version: number
  fulfillmentStatus: string
  priceApprovalStatus: string
  isDemo: boolean
  lines: OrderLine[]
}

type Totals = { itemsTotal: number; deliveryFee: number; grandTotal: number }

type ProposalReview = {
  lines: { lineId: string; productName: string; quantity: number; originalUnitPrice: number; proposedUnitPrice: number }[]
  originalTotals: Totals
  proposedTotals: Totals
  explanation: string
  activeProposalId: string | null
  deliveryMode: 'resend' | 'log' | 'invalid'
}

type OrderDocResponse = {
  version?: number | null
  fulfillmentStatus?: string
  priceApprovalStatus?: string
  isDemo?: boolean | null
  items?: { lineId?: string | null; productName?: string | null; sku?: string | null; quantity?: number | null }[] | null
  agreed?: { lines?: { lineId: string; unitPrice: number }[] } | null
}

const huf = (value: number): string => `${new Intl.NumberFormat('hu-HU').format(value)} Ft`
const panel: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginBottom: 16 }
const TERMINAL: ReadonlySet<string> = new Set(['completed', 'cancelled'])
const NO_PROPOSAL: ReadonlySet<string> = new Set(['dispatched', 'completed', 'cancelled'])

async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  return { ok: response.ok, data }
}

/**
 * Order workflow actions in the native order view: store cancellation (mandatory reason) and price-change
 * proposals (edit prices → server-computed review → explicit send). All rules are enforced by the
 * server endpoints and services; this component only collects input and shows results.
 */
export function OrderActions(): React.JSX.Element | null {
  const { id } = useDocumentInfo()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [reason, setReason] = useState<string>('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [explanation, setExplanation] = useState<string>('')
  const [supersede, setSupersede] = useState<boolean>(false)
  const [review, setReview] = useState<ProposalReview | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    void fetch(`/api/orders/${id}?depth=0`, { credentials: 'include' })
      .then((response: Response) => (response.ok ? (response.json() as Promise<OrderDocResponse>) : null))
      .then((doc: OrderDocResponse | null) => {
        if (!active || !doc) return
        const agreed = new Map((doc.agreed?.lines ?? []).map((line) => [line.lineId, line.unitPrice]))
        setOrder({
          version: doc.version ?? 1,
          fulfillmentStatus: doc.fulfillmentStatus ?? '',
          priceApprovalStatus: doc.priceApprovalStatus ?? '',
          isDemo: Boolean(doc.isDemo),
          lines: (doc.items ?? []).map((item) => ({
            lineId: item.lineId ?? '',
            productName: item.productName ?? '',
            sku: item.sku ?? '',
            quantity: item.quantity ?? 0,
            unitPrice: agreed.get(item.lineId ?? '') ?? 0,
          })),
        })
      })
    return () => {
      active = false
    }
  }, [id])

  if (!id || !order) return null
  if (order.isDemo) {
    return (
      <div style={panel}>
        <strong>Demó (történeti) rendelés.</strong> Nem módosítható, nem kap e-mailt és nem kerül ütemezett feldolgozásba.
      </div>
    )
  }

  const finish = (ok: boolean, text: string): void => {
    setMessage({ kind: ok ? 'ok' : 'error', text })
    setBusy(false)
    if (ok) window.setTimeout(() => window.location.reload(), 1200)
  }

  const cancel = async (): Promise<void> => {
    if (reason.trim().length < 3) {
      setMessage({ kind: 'error', text: 'Adja meg a törlés okát (legalább 3 karakter).' })
      return
    }
    if (!window.confirm('Biztosan törli a teljes rendelést? A művelet nem vonható vissza; az ügyfél (ha engedélyezett) e-mailt kap, és egy függő árváltozási ajánlat visszavonásra kerül.')) return
    setBusy(true)
    const { ok, data } = await post(`/api/orders/${id}/cancel`, { reason, version: order.version })
    finish(ok, ok ? 'A rendelés törölve.' : String(data.error ?? 'A törlés nem sikerült.'))
  }

  const proposalBody = (): Record<string, unknown> => ({
    lines: order.lines.filter((line) => prices[line.lineId] !== undefined && prices[line.lineId] !== '').map((line) => ({ lineId: line.lineId, proposedUnitPrice: Number(prices[line.lineId]) })),
    explanation,
    supersedeActive: supersede,
  })

  const runReview = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const { ok, data } = await post(`/api/orders/${id}/price-change`, { ...proposalBody(), review: true })
    setBusy(false)
    if (!ok) {
      setReview(null)
      setMessage({ kind: 'error', text: String(data.error ?? 'Az ellenőrzés nem sikerült.') })
      return
    }
    setReview(data.review as ProposalReview)
  }

  const send = async (): Promise<void> => {
    if (!window.confirm('Elküldi az árváltozási ajánlatot az ügyfélnek? A teljesítés a döntésig szünetel.')) return
    setBusy(true)
    const { ok, data } = await post(`/api/orders/${id}/price-change`, proposalBody())
    finish(
      ok,
      ok
        ? data.sentAt
          ? 'Ajánlat létrehozva és átadva a Resendnek. A válaszhatáridő elindult.'
          : `Ajánlat létrehozva, de az e-mail nem lett elküldve${data.lastError ? `: ${String(data.lastError)}` : ''}. Határidő nem indult; az ütemező újrapróbálja.`
        : String(data.error ?? 'Az ajánlat létrehozása nem sikerült.'),
    )
  }

  return (
    <div>
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} style={{ ...panel, color: message.kind === 'error' ? 'var(--theme-error-500)' : 'var(--theme-success-500)' }}>
          {message.text}
        </p>
      ) : null}

      {!NO_PROPOSAL.has(order.fulfillmentStatus) ? (
        <div style={panel}>
          <h3 style={{ marginTop: 0 }}>Árváltozási ajánlat</h3>
          {order.priceApprovalStatus === 'pending' ? <p>Az ügyfél döntésére vár egy aktív ajánlat. Új ajánlathoz kifejezetten jelölje a felülírást.</p> : null}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Termék</th>
                <th>Db</th>
                <th>Érvényes egységár</th>
                <th>Új egységár (Ft)</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.lineId}>
                  <td>
                    {line.productName} <small>({line.sku})</small>
                  </td>
                  <td style={{ textAlign: 'center' }}>{line.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{huf(line.unitPrice)}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`${line.productName} új egységára`}
                      value={prices[line.lineId] ?? ''}
                      placeholder={String(line.unitPrice)}
                      onChange={(event) => {
                        setReview(null)
                        setPrices({ ...prices, [line.lineId]: event.target.value })
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label style={{ display: 'block', marginTop: 12 }}>
            Indoklás az ügyfélnek (kötelező, legalább 10 karakter)
            <textarea
              rows={3}
              style={{ width: '100%' }}
              value={explanation}
              onChange={(event) => {
                setReview(null)
                setExplanation(event.target.value)
              }}
            />
          </label>
          {order.priceApprovalStatus === 'pending' ? (
            <label style={{ display: 'block', marginTop: 8 }}>
              <input type="checkbox" checked={supersede} onChange={(event) => setSupersede(event.target.checked)} /> Az aktív ajánlat felülírása (a korábbi döntési link érvénytelen lesz)
            </label>
          ) : null}
          <button type="button" className="btn btn--style-secondary btn--size-medium" disabled={busy} onClick={runReview}>
            Ellenőrzés
          </button>
          {review ? (
            <div style={{ marginTop: 12 }}>
              <h4>Ellenőrzés – még semmi nem került mentésre vagy kiküldésre</h4>
              <ul>
                {review.lines
                  .filter((line) => line.originalUnitPrice !== line.proposedUnitPrice)
                  .map((line) => (
                    <li key={line.lineId}>
                      {line.productName} ({line.quantity} db): {huf(line.originalUnitPrice)} → <strong>{huf(line.proposedUnitPrice)}</strong>
                    </li>
                  ))}
              </ul>
              <p>
                Végösszeg: {huf(review.originalTotals.grandTotal)} → <strong>{huf(review.proposedTotals.grandTotal)}</strong> (szállítás: {huf(review.proposedTotals.deliveryFee)})
              </p>
              {review.deliveryMode !== 'resend' ? (
                <p role="alert">
                  Figyelem: az e-mail mód nem éles ({review.deliveryMode}). Az ajánlat nem kerül ténylegesen kiküldésre, ezért válaszhatáridő sem indul.
                </p>
              ) : null}
              <button type="button" className="btn btn--style-primary btn--size-medium" disabled={busy} onClick={send}>
                Ajánlat küldése az ügyfélnek
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!TERMINAL.has(order.fulfillmentStatus) ? (
        <div style={panel}>
          <h3 style={{ marginTop: 0 }}>Rendelés törlése</h3>
          <label style={{ display: 'block' }}>
            A törlés oka (kötelező; a naplóba kerül)
            <textarea rows={2} style={{ width: '100%' }} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button type="button" className="btn btn--style-secondary btn--size-medium" disabled={busy} onClick={cancel}>
            Rendelés törlése
          </button>
        </div>
      ) : null}
    </div>
  )
}
