import { CheckIcon, XIcon } from 'lucide-react'
import type { Metadata } from 'next'
import type React from 'react'

import { decideAction } from '@/app/(frontend)/arvaltozas/[token]/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Button } from '@/components/shadcn/button'
import { PROPOSAL_STATUS_LABELS } from '@/config/labels'
import { formatDateTime, formatHuf } from '@/lib/format'
import { priceChangeService } from '@/services/priceChangeService'

export const metadata: Metadata = { title: 'Árváltozás – döntés', robots: { index: false, follow: false }, referrer: 'no-referrer' }

type DecisionPageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const RESULT_TEXT: Record<string, string> = {
  accepted: 'Köszönjük! Elfogadta az árváltozást, a rendelés teljesítését folytatjuk. Visszaigazolást küldtünk e-mailben.',
  rejected: 'Elutasította az árváltozást. A teljes rendelést töröltük, erről e-mailt küldtünk.',
  invalid: 'A link érvénytelen.',
}

/** GET: read-only view. Expired, replayed and superseded links are shown safely without changing anything. */
export default async function DecisionPage(props: DecisionPageProps): Promise<React.JSX.Element> {
  const [{ token }, searchParams] = await Promise.all([props.params, props.searchParams])
  const view = await priceChangeService.getDecisionView(decodeURIComponent(token))
  const result = typeof searchParams.eredmeny === 'string' ? searchParams.eredmeny : null
  const needsConfirmation = searchParams.hiba === 'megerosites'

  if (view.state === 'invalid') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold">A link érvénytelen</h1>
        <p className="mt-3 text-muted-foreground">Ez a döntési link nem létezik vagy már nem használható. Ha kérdése van, keressen minket e-mailben.</p>
      </div>
    )
  }

  const deadline = view.deadlines.expiresAt ?? view.deadlines.earliestCancellationAt
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold">Árváltozás – {view.orderReference}</h1>
      <p className="mt-2 text-muted-foreground">Kedves {view.customerName}! Indoklás: {view.explanation}</p>

      {result && RESULT_TEXT[result] ? (
        <Alert className="mt-6" role="status">
          <AlertTitle>Döntés rögzítve</AlertTitle>
          <AlertDescription>{RESULT_TEXT[result]}</AlertDescription>
        </Alert>
      ) : null}

      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">Eredeti és új árak</caption>
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Tétel</th>
            <th className="py-2 text-right">Eredeti egységár</th>
            <th className="py-2 text-right">Új egységár</th>
          </tr>
        </thead>
        <tbody>
          {view.lines.map((line) => (
            <tr key={line.lineId} className="border-b">
              <td className="py-2">
                {line.productName} ({line.quantity} db)
              </td>
              <td className="py-2 text-right">{formatHuf(line.originalUnitPrice)}</td>
              <td className="py-2 text-right font-semibold">{formatHuf(line.proposedUnitPrice)}</td>
            </tr>
          ))}
          <tr className="font-bold text-ink">
            <td className="py-2">Végösszeg</td>
            <td className="py-2 text-right">{formatHuf(view.originalTotals.grandTotal)}</td>
            <td className="py-2 text-right">{formatHuf(view.proposedTotals.grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      {view.state === 'pending' ? (
        <>
          <ul className="mt-6 list-disc space-y-1 pl-5 text-sm">
            <li>Elfogadás esetén az új ár lesz érvényes, a rendelést teljesítjük.</li>
            <li>
              Elutasítás esetén a <strong>teljes rendelés</strong> azonnal törlődik.
            </li>
            <li>
              {view.deadlines.expiresAt
                ? `Végső határidő: ${formatDateTime(view.deadlines.expiresAt)} (budapesti idő). Ha addig nem dönt, a rendelés automatikusan törlődik.`
                : deadline
                  ? `Ha nem dönt, emlékeztetőt küldünk; a rendelés legkorábban ${formatDateTime(deadline)}-kor törlődhet automatikusan.`
                  : 'Ha nem dönt, emlékeztetőt küldünk, majd a rendelés automatikusan törlődik.'}
            </li>
          </ul>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <form action={decideAction} className="rounded-xl border p-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="decision" value="accept" />
              <p className="mb-3 text-sm">Elfogadom az új árat ({formatHuf(view.proposedTotals.grandTotal)}).</p>
              <Button type="submit" className="w-full">
                <CheckIcon aria-hidden="true" />
                Elfogadom
              </Button>
            </form>
            <form action={decideAction} className="rounded-xl border border-destructive/40 p-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="decision" value="reject" />
              <label className="mb-3 flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirmReject" required className="mt-1 size-4" aria-invalid={needsConfirmation || undefined} />
                <span>Tudomásul veszem, hogy elutasítás esetén a teljes rendelés törlődik.</span>
              </label>
              {needsConfirmation ? <p className="mb-2 text-sm text-destructive">Az elutasításhoz jelölje be a megerősítést.</p> : null}
              <Button type="submit" variant="destructive" className="w-full">
                <XIcon aria-hidden="true" />
                Elutasítom, a rendelés törlődjön
              </Button>
            </form>
          </div>
        </>
      ) : !result ? (
        <Alert className="mt-6">
          <AlertTitle>Ez az ajánlat már lezárult: {PROPOSAL_STATUS_LABELS[view.state].toLowerCase()}</AlertTitle>
          <AlertDescription>
            {view.state === 'superseded' ? 'Időközben új ajánlatot küldtünk; kérjük, a legfrissebb e-mailben található linket használja.' : 'A link már nem használható döntésre. A rendelés állapotáról e-mailben tájékoztattuk.'}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
