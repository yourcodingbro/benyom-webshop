import { ArrowRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type React from 'react'

import {
  advanceClockAction,
  cancelOrderAction,
  changePriceAction,
  createProposalAction,
  emailFailureAction,
  resetAllAction,
  resetClockAction,
  runSchedulerAction,
  updateStatusAction,
} from '@/app/(frontend)/fejlesztes/actions'
import { CsvImportForm } from '@/components/dev/CsvImportForm'
import { Button } from '@/components/shadcn/button'
import { FULFILLMENT_LABELS, PRICE_APPROVAL_LABELS, PROPOSAL_STATUS_LABELS } from '@/config/labels'
import { FULFILLMENT_TRANSITIONS } from '@/config/order-rules'
import { areDevToolsEnabled } from '@/config/runtime'
import { getEmailLogEntries } from '@/dto/email-log'
import { getOrders } from '@/dto/orders'
import { getProposalsForOrder } from '@/dto/price-change-proposals'
import { getAllProducts } from '@/dto/products'
import { getDevAdminAuthorization } from '@/lib/authorization'
import { clock, HOUR_MS } from '@/lib/clock'
import { getEmailFailureMode } from '@/lib/dev-simulation'
import { formatDateTime, formatHuf } from '@/lib/format'
import { priceChangeService } from '@/services/priceChangeService'
import type { Order } from '@/types/order'

export const metadata: Metadata = { title: 'Fejlesztői eszközök', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type DevToolsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type SectionProps = {
  title: string
  children: React.ReactNode
}

function Section(props: SectionProps): React.JSX.Element {
  return (
    <section className="rounded-xl border p-5">
      <h2 className="mb-4 text-lg font-bold">{props.title}</h2>
      {props.children}
    </section>
  )
}

const inputClass = 'h-9 rounded-md border border-input bg-white px-2 text-sm'

/** Development-only control panel acting as a sample administrator. Returns 404 whenever dev tools are disabled. */
export default async function DevToolsPage(props: DevToolsPageProps): Promise<React.JSX.Element> {
  if (!areDevToolsEnabled()) notFound()
  const auth = getDevAdminAuthorization()
  const searchParams = await props.searchParams
  const message = typeof searchParams.uzenet === 'string' ? searchParams.uzenet : null
  const [orders, emails, products] = await Promise.all([getOrders({ pageSize: 50 }, auth), getEmailLogEntries(auth), getAllProducts(auth)])
  const proposalsByOrder = new Map(await Promise.all(orders.items.map(async (order: Order) => [order.reference, await getProposalsForOrder(order.reference, auth)] as const)))
  const failure = getEmailFailureMode()
  const offsetHours = Math.round((clock.offsetMs() / HOUR_MS) * 10) / 10

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-bold">Fejlesztői eszközök (minta mód)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Csak fejlesztői környezetben érhető el; éles környezetben 404. A mintaállapot a szerverfolyamat memóriájában él, újraindításkor elvész. Az ütemezőt itt kézzel kell futtatni – éles időzített feladat nincs.
        </p>
      </div>
      {message ? (
        <p role="status" className="rounded-md bg-amber-100 px-4 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <Section title="Idő, ütemező és e-mail szimuláció">
        <p className="mb-3 text-sm">
          Szimulált idő: <strong>{formatDateTime(clock.nowIso())}</strong> (eltolás: {offsetHours} óra) · E-mail hibaszimuláció: <strong>{failure.kind === 'none' ? 'kikapcsolva' : failure.kind === 'fail-all' ? 'minden küldés sikertelen' : 'a következő küldés sikertelen'}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 12, 24].map((hours: number) => (
            <form key={hours} action={advanceClockAction}>
              <input type="hidden" name="hours" value={hours} />
              <Button type="submit" variant="outline" size="sm">
                +{hours} óra
              </Button>
            </form>
          ))}
          <form action={resetClockAction}>
            <Button type="submit" variant="outline" size="sm">
              Idő visszaállítása
            </Button>
          </form>
          <form action={runSchedulerAction}>
            <Button type="submit" size="sm">
              Ütemező futtatása
            </Button>
          </form>
          <form action={emailFailureAction} className="flex gap-2">
            <label className="sr-only" htmlFor="hibamod">
              E-mail hibamód
            </label>
            <select id="hibamod" name="mode" defaultValue={failure.kind} className={inputClass}>
              <option value="none">E-mail: sikeres</option>
              <option value="fail-next">Következő sikertelen</option>
              <option value="fail-all">Minden sikertelen</option>
            </select>
            <Button type="submit" variant="outline" size="sm">
              Beállítás
            </Button>
          </form>
          <form action={resetAllAction}>
            <Button type="submit" variant="destructive" size="sm">
              Teljes visszaállítás
            </Button>
          </form>
        </div>
      </Section>

      <Section title="Katalógusár módosítása (árajánlat-demó)">
        <form action={changePriceAction} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Változat
            <select name="target" className={`${inputClass} block`}>
              {products.flatMap((product) =>
                product.variants.map((variant) => (
                  <option key={variant.sku} value={`${product.id}|${variant.sku}`}>
                    {product.name} – {variant.sku} ({formatHuf(variant.price)})
                  </option>
                )),
              )}
            </select>
          </label>
          <label className="text-sm">
            Változás (%)
            <input name="percent" type="number" defaultValue={5} min={-50} max={50} className={`${inputClass} block w-24`} />
          </label>
          <Button type="submit" size="sm">
            Ár módosítása
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Kosárba tett termék árának emelése után a korábbi, még érvényes ajánlati ár marad érvényben a leadáskor, a rendelés pedig árellenőrzésre jelölődik.</p>
      </Section>

      <Section title={`Rendelések (${orders.totalItems})`}>
        <ul className="space-y-4">
          {orders.items.map((order: Order) => {
            const proposals = proposalsByOrder.get(order.reference) ?? []
            const next = FULFILLMENT_TRANSITIONS[order.fulfillmentStatus]
            const closed = ['dispatched', 'completed', 'cancelled'].includes(order.fulfillmentStatus)
            return (
              <li key={order.id} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <strong className="font-heading text-base">{order.reference}</strong> · {order.submission.customer.name} · {formatDateTime(order.createdAt)}
                  </p>
                  <p>
                    {FULFILLMENT_LABELS[order.fulfillmentStatus]} · Árjóváhagyás: {PRICE_APPROVAL_LABELS[order.priceApprovalStatus]} · <strong>{formatHuf(order.agreed.totals.grandTotal)}</strong>
                    {order.needsPriceReview ? <span className="ml-2 rounded bg-amber-100 px-1.5">árellenőrzés javasolt</span> : null}
                  </p>
                </div>
                {order.cancellation ? <p className="mt-1 text-destructive">Törölve: {order.cancellation.reason} ({formatDateTime(order.cancellation.at)})</p> : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {next.map((status) => (
                    <form key={status} action={updateStatusAction}>
                      <input type="hidden" name="reference" value={order.reference} />
                      <input type="hidden" name="version" value={order.version} />
                      <input type="hidden" name="status" value={status} />
                      <Button type="submit" size="xs" variant="outline">
                        <ArrowRightIcon aria-hidden="true" />
                        {FULFILLMENT_LABELS[status]}
                      </Button>
                    </form>
                  ))}
                  {!closed ? (
                    <form action={cancelOrderAction} className="flex gap-1">
                      <input type="hidden" name="reference" value={order.reference} />
                      <input type="hidden" name="version" value={order.version} />
                      <input name="note" placeholder="Törlés oka" aria-label="Törlés oka" className={`${inputClass} h-6 text-xs`} />
                      <Button type="submit" size="xs" variant="destructive">
                        Törlés
                      </Button>
                    </form>
                  ) : null}
                </div>

                {!closed ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-semibold">Árváltozási ajánlat létrehozása</summary>
                    <form action={createProposalAction} className="mt-2 space-y-2">
                      <input type="hidden" name="reference" value={order.reference} />
                      {order.submission.lines.map((line) => {
                        const agreed = order.agreed.lines.find((item) => item.lineId === line.lineId)
                        const current = products.flatMap((product) => product.variants).find((variant) => variant.sku === line.sku)?.price
                        return (
                          <label key={line.lineId} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="lineId" value={line.lineId} />
                            <span className="min-w-64">
                              {line.productName} ({line.sku}) – most: {formatHuf(agreed?.unitPrice ?? line.unitPrice)}
                            </span>
                            <input name={`price-${line.lineId}`} type="number" min={0} step={10} defaultValue={current ?? agreed?.unitPrice} className={`${inputClass} w-32`} aria-label={`${line.productName} javasolt egységára`} />
                          </label>
                        )
                      })}
                      <textarea name="explanation" required minLength={10} defaultValue="A beszállítói beszerzési ár a rendelés leadása óta megemelkedett." className="w-full rounded-md border border-input p-2" aria-label="Indoklás" />
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="supersede" /> Aktív ajánlat felülírása (a korábbi linkek érvénytelenné válnak)
                      </label>
                      <Button type="submit" size="sm">
                        Ajánlat küldése
                      </Button>
                    </form>
                  </details>
                ) : null}

                {proposals.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t pt-2">
                    {proposals.map((proposal) => {
                      const deadlines = priceChangeService.getDeadlines(proposal)
                      return (
                        <li key={proposal.id}>
                          Ajánlat <code>{proposal.id}</code>: {PROPOSAL_STATUS_LABELS[proposal.status]} · {formatHuf(proposal.originalTotals.grandTotal)} <ArrowRightIcon className="inline size-3.5 align-[-2px]" aria-label="helyett" />{' '}{formatHuf(proposal.proposedTotals.grandTotal)} · ajánlat e-mail:{' '}
                          {proposal.proposalEmail.sentAt ? formatDateTime(proposal.proposalEmail.sentAt) : `nincs elküldve (${proposal.proposalEmail.attempts} kísérlet)`} · emlékeztető:{' '}
                          {proposal.reminderEmail.sentAt ? formatDateTime(proposal.reminderEmail.sentAt) : deadlines.reminderDueAt ? `esedékes ${formatDateTime(deadlines.reminderDueAt)}` : '–'}
                          {deadlines.expiresAt ? ` · végső határidő: ${formatDateTime(deadlines.expiresAt)}` : ''}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}

                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">Előzmények és értesítések</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {order.events.map((event) => (
                      <li key={event.id}>
                        {formatDateTime(event.at)} – {event.message}
                      </li>
                    ))}
                    {order.notifications.map((record) => (
                      <li key={record.id}>
                        E-mail {record.templateId} ({record.recipientRole}): {record.status === 'failed' ? `SIKERTELEN – ${record.error}` : 'szimuláltan elküldve'}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title={`E-mail napló – szimulált (${emails.length})`}>
        {emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nem készült e-mail.</p>
        ) : (
          <ul className="divide-y text-sm">
            {emails.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {formatDateTime(entry.at)} · {entry.to} · {entry.subject}
                </span>
                <span>
                  {entry.status === 'failed' ? <span className="text-destructive">sikertelen</span> : 'szimulált siker'} ·{' '}
                  {entry.preview ? (
                    <Link href={`/fejlesztes/email/${entry.id}`} className="font-semibold text-primary underline">
                      Előnézet
                    </Link>
                  ) : (
                    'nincs előnézet'
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="CSV termékimport">
        <p className="mb-3 text-sm">
          Minta: <a href="/minta/termekimport-minta.csv" className="font-semibold text-primary underline">termekimport-minta.csv</a>. Formátum és szabályok: docs/csv-import.md.
        </p>
        <CsvImportForm />
      </Section>
    </div>
  )
}
